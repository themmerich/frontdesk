package de.prime_ux.backend.cases;

import de.prime_ux.backend.cases.CaseMessageRepository.MessageCountPerCase;
import de.prime_ux.backend.cases.CaseNoteRepository.NoteCountPerCase;
import de.prime_ux.backend.triage.CaseCategory;
import de.prime_ux.backend.triage.CaseCategoryRepository;
import de.prime_ux.backend.users.AppUser;
import de.prime_ux.backend.auth.CurrentSession;
import de.prime_ux.backend.users.AppUserRepository;
import jakarta.validation.Valid;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.ZoneId;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;
import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/cases")
class CaseController {

	private final CurrentSession currentSession;
	private final CaseRepository caseRepository;
	private final CaseMessageRepository caseMessageRepository;
	private final CaseNoteRepository caseNoteRepository;
	private final CaseAttachmentRepository caseAttachmentRepository;
	private final CaseDetails caseDetails;
	private final CaseEvents caseEvents;
	private final CaseCategoryRepository caseCategoryRepository;
	private final AppUserRepository appUserRepository;

	CaseController(CurrentSession currentSession, CaseRepository caseRepository, CaseMessageRepository caseMessageRepository,
			CaseNoteRepository caseNoteRepository, CaseAttachmentRepository caseAttachmentRepository,
			CaseDetails caseDetails, CaseEvents caseEvents, CaseCategoryRepository caseCategoryRepository,
			AppUserRepository appUserRepository) {
		this.currentSession = currentSession;
		this.caseRepository = caseRepository;
		this.caseMessageRepository = caseMessageRepository;
		this.caseNoteRepository = caseNoteRepository;
		this.caseAttachmentRepository = caseAttachmentRepository;
		this.caseDetails = caseDetails;
		this.caseEvents = caseEvents;
		this.caseCategoryRepository = caseCategoryRepository;
		this.appUserRepository = appUserRepository;
	}

	/**
	 * Only the cases of the signed-in user's tenant — tenants never see each other's mail. How
	 * long each conversation is comes from one grouped query rather than one per row.
	 */
	@GetMapping
	List<CaseResponse> listCases() {
		UUID tenantId = currentSession.tenant().getId();
		Map<UUID, Long> messageCounts = caseMessageRepository.countPerCase(tenantId).stream()
				.collect(Collectors.toMap(MessageCountPerCase::getCaseId, MessageCountPerCase::getMessageCount));
		Map<UUID, Long> noteCounts = caseNoteRepository.countPerCase(tenantId).stream()
				.collect(Collectors.toMap(NoteCountPerCase::getCaseId, NoteCountPerCase::getNoteCount));
		return caseRepository.findAllByTenantIdOrderByLastMessageAtDesc(tenantId).stream()
				.map(aCase -> CaseResponse.from(aCase, messageCounts.getOrDefault(aCase.getId(), 0L),
						noteCounts.getOrDefault(aCase.getId(), 0L)))
				.toList();
	}

	/**
	 * What the dashboard shows, summed in the database: the rows never leave the server, only the
	 * numbers do. Stands before {@code /{id}}, which takes a UUID and therefore cannot catch it.
	 */
	@GetMapping("/statistics")
	@Transactional(readOnly = true)
	CaseStatisticsResponse getStatistics() {
		Instant now = Instant.now();
		UUID tenantId = currentSession.tenant().getId();
		// The server's zone decides where a day and a month end; the tenants are German
		// businesses and the server stands where they do.
		ZoneId zone = ZoneId.systemDefault();
		Map<String, CaseRepository.WindowCount> windows = new LinkedHashMap<>();
		for (String window : CaseStatisticsReport.windows()) {
			CaseStatisticsReport.Bounds bounds = CaseStatisticsReport.boundsFor(window, now, zone);
			windows.put(window, caseRepository.countInWindow(tenantId, bounds.from(), bounds.to(),
					bounds.previousFrom(), bounds.previousTo()));
		}
		return CaseStatisticsReport.build(caseRepository.totals(tenantId), windows,
				caseRepository.countByCategory(tenantId), caseRepository.countByTier(tenantId),
				caseRepository.countByPeriod(tenantId, CaseStatisticsReport.hoursReach(now, zone), "hour",
						zone.getId(), "YYYY-MM-DD\"T\"HH24"),
				caseRepository.countByPeriod(tenantId, CaseStatisticsReport.daysReach(now, zone), "day", zone.getId(),
						"YYYY-MM-DD"),
				caseRepository.countByPeriod(tenantId, CaseStatisticsReport.monthsReach(now, zone), "month",
						zone.getId(), "YYYY-MM"),
				now, zone);
	}

	/**
	 * One case with its body, which the list deliberately does not carry. A case of another tenant
	 * is not found rather than forbidden — the answer must not say that it exists.
	 */
	@GetMapping("/{id}")
	CaseDetailResponse getCase(@PathVariable UUID id) {
		return caseDetails.of(ownCase(id, currentSession.tenant().getId()));
	}

	/**
	 * The bytes of one attachment, reached only through its case, so another tenant's attachment
	 * is not found rather than forbidden. Pictures and PDFs are handed over to be shown, since a
	 * browser can; everything else is handed over to be saved. The file name goes into the header
	 * escaped, whatever the sender called the file. Served from the trash as well: what was thrown
	 * away can be read until it is purged.
	 */
	@GetMapping("/{id}/attachments/{attachmentId}")
	ResponseEntity<byte[]> getAttachment(@PathVariable UUID id, @PathVariable UUID attachmentId) {
		Case aCase = ownCase(id, currentSession.tenant().getId());
		CaseAttachment attachment = caseAttachmentRepository.findByIdAndMailCaseId(attachmentId, aCase.getId())
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
		MediaType type = mediaTypeOf(attachment.getContentType());
		ContentDisposition disposition = (opensInTheBrowser(type) ? ContentDisposition.inline()
				: ContentDisposition.attachment()).filename(attachment.getFileName(), StandardCharsets.UTF_8).build();
		return ResponseEntity.ok()
				.contentType(type)
				.contentLength(attachment.getSizeBytes())
				.header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
				// The type is what the row says, not what the browser makes of the first bytes.
				.header("X-Content-Type-Options", "nosniff")
				.cacheControl(CacheControl.maxAge(0, TimeUnit.SECONDS).cachePrivate())
				.body(attachment.getContent());
	}

	private static MediaType mediaTypeOf(String contentType) {
		try {
			return MediaType.parseMediaType(contentType);
		} catch (IllegalArgumentException e) {
			return MediaType.APPLICATION_OCTET_STREAM;
		}
	}

	private static boolean opensInTheBrowser(MediaType type) {
		return "image".equals(type.getType()) || MediaType.APPLICATION_PDF.equalsTypeAndSubtype(type);
	}

	/**
	 * A person overruling the triage: which category the case belongs to and what happens with it,
	 * saved in one go because that is how the page offers them. The summary and the confidence
	 * stay what the model said — they still describe the classification it made.
	 *
	 * <p>A category of another tenant is not found rather than forbidden, for the same reason a
	 * case of another tenant is not.
	 */
	@PutMapping("/{id}/classification")
	@Transactional
	CaseDetailResponse changeClassification(@PathVariable UUID id,
			@Valid @RequestBody ChangeClassificationRequest request) {
		AppUser person = currentSession.user();
		UUID tenantId = currentSession.tenant().getId();
		Case aCase = ownCase(id, tenantId);
		CaseCategory category = request.categoryId() == null ? null : ownCategory(request.categoryId(), tenantId);
		aCase.changeCategory(category);
		aCase.changeTier(request.toTier());
		Case saved = caseRepository.save(aCase);
		caseEvents.record(saved, CaseEventType.CLASSIFICATION_CORRECTED, person, CaseEvents.details("tier",
				request.toTier() == null ? null : request.toTier().name().toLowerCase(Locale.ROOT), "categoryName",
				category == null ? null : category.getName()));
		return caseDetails.of(saved);
	}

	/**
	 * Somebody takes the case, hands it to a colleague, or puts it down again. Open to everyone
	 * who works in the inbox, not only to admins: picking up work must not need an administrator,
	 * and handing it over is the normal move in a shared queue.
	 */
	@PutMapping("/{id}/assignee")
	@Transactional
	CaseDetailResponse assign(@PathVariable UUID id, @Valid @RequestBody AssignCaseRequest request) {
		AppUser person = currentSession.user();
		UUID tenantId = currentSession.tenant().getId();
		Case aCase = ownCase(id, tenantId);
		AppUser assignee = request.userId() == null ? null : ownUser(request.userId(), tenantId);
		aCase.assignTo(assignee);
		Case saved = caseRepository.save(aCase);
		caseEvents.record(saved, assignee == null ? CaseEventType.UNASSIGNED : CaseEventType.ASSIGNED, person,
				// The name as it stands now, so the entry survives the account, the way the rest
				// of the trail does.
				CaseEvents.details("assigneeName", assignee == null ? null : CaseEvents.nameOf(assignee)));
		return caseDetails.of(saved);
	}

	/**
	 * A person taking note of a case, or taking that back. Not a deletion and not a correction of
	 * the triage: what the model said still stands, it has just been read by somebody.
	 */
	@PutMapping("/{id}/handled")
	@Transactional
	CaseDetailResponse markHandled(@PathVariable UUID id, @Valid @RequestBody MarkHandledRequest request) {
		AppUser person = currentSession.user();
		Case aCase = ownCase(id, currentSession.tenant().getId());
		aCase.markHandled(request.handled());
		Case saved = caseRepository.save(aCase);
		caseEvents.record(saved, request.handled() ? CaseEventType.HANDLED : CaseEventType.REOPENED, person, Map.of());
		return caseDetails.of(saved);
	}

	/**
	 * Throws a selection away: it moves to the trash rather than leaving, because a mail cannot be
	 * fetched again once the mailbox has marked it read. Ids belonging to another tenant match
	 * nothing, so the answer is the same whether they exist or not.
	 */
	@DeleteMapping
	@ResponseStatus(HttpStatus.NO_CONTENT)
	@Transactional
	void deleteCases(@Valid @RequestBody DeleteCasesRequest request) {
		AppUser person = currentSession.user();
		List<Case> own = ownCases(request.ids(), currentSession.tenant().getId());
		own.forEach(Case::moveToTrash);
		caseRepository.saveAll(own).forEach(aCase -> caseEvents.record(aCase, CaseEventType.TRASHED, person, Map.of()));
	}

	/** Back out of the trash, to where the case was: the archive if it was worked through. */
	@PutMapping("/restore")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	@Transactional
	void restoreCases(@Valid @RequestBody DeleteCasesRequest request) {
		AppUser person = currentSession.user();
		List<Case> own = ownCases(request.ids(), currentSession.tenant().getId());
		own.forEach(Case::restore);
		caseRepository.saveAll(own).forEach(aCase -> caseEvents.record(aCase, CaseEventType.RESTORED, person, Map.of()));
	}

	/**
	 * Deletes a selection for good; the trash asks before it gets here. Only from the trash: what
	 * is still in the inbox has been thrown away by nobody, and this cannot be undone.
	 */
	@DeleteMapping("/purge")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	@Transactional
	void purgeCases(@Valid @RequestBody DeleteCasesRequest request) {
		List<UUID> inTheTrash = ownCases(request.ids(), currentSession.tenant().getId()).stream()
				.filter(aCase -> aCase.getDeletedAt() != null).map(Case::getId).toList();
		if (!inTheTrash.isEmpty()) {
			caseRepository.deleteByTenantIdAndIdIn(currentSession.tenant().getId(), inTheTrash);
		}
	}

	private List<Case> ownCases(List<UUID> ids, UUID tenantId) {
		return caseRepository.findAllByTenantIdAndIdIn(tenantId, ids);
	}

	private Case ownCase(UUID id, UUID tenantId) {
		return caseRepository.findWithCategoryById(id)
				.filter(aCase -> aCase.getTenant().getId().equals(tenantId))
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
	}

	/**
	 * A colleague of this tenant. Somebody else's user is a bad request rather than a not-found:
	 * the id came from a picker that only ever offers this tenant's people, so a mismatch is a
	 * broken client, not a case of guessing at ids.
	 */
	private AppUser ownUser(UUID id, UUID tenantId) {
		return appUserRepository.findById(id)
				.filter(user -> user.getTenant() != null && user.getTenant().getId().equals(tenantId))
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST,
						"the user does not belong to this tenant"));
	}

	private CaseCategory ownCategory(UUID id, UUID tenantId) {
		return caseCategoryRepository.findById(id)
				.filter(category -> category.getTenant().getId().equals(tenantId))
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
	}


}
