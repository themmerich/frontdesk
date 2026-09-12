package de.prime_ux.backend.cases;

import de.prime_ux.backend.triage.CaseCategory;
import de.prime_ux.backend.triage.CaseCategoryRepository;
import de.prime_ux.backend.users.AppUser;
import de.prime_ux.backend.users.AppUserRepository;
import jakarta.validation.Valid;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
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

	private final CaseRepository caseRepository;
	private final CaseAttachmentRepository caseAttachmentRepository;
	private final CaseDetails caseDetails;
	private final CaseCategoryRepository caseCategoryRepository;
	private final AppUserRepository appUserRepository;

	CaseController(CaseRepository caseRepository, CaseAttachmentRepository caseAttachmentRepository,
			CaseDetails caseDetails, CaseCategoryRepository caseCategoryRepository,
			AppUserRepository appUserRepository) {
		this.caseRepository = caseRepository;
		this.caseAttachmentRepository = caseAttachmentRepository;
		this.caseDetails = caseDetails;
		this.caseCategoryRepository = caseCategoryRepository;
		this.appUserRepository = appUserRepository;
	}

	/** Only the cases of the signed-in user's tenant — tenants never see each other's mail. */
	@GetMapping
	List<CaseResponse> listCases(Authentication authentication) {
		return caseRepository.findAllByTenantIdOrderByReceivedAtDesc(currentTenantId(authentication)).stream()
				.map(CaseResponse::from).toList();
	}

	/**
	 * One case with its body, which the list deliberately does not carry. A case of another tenant
	 * is not found rather than forbidden — the answer must not say that it exists.
	 */
	@GetMapping("/{id}")
	CaseDetailResponse getCase(@PathVariable UUID id, Authentication authentication) {
		return caseDetails.of(ownCase(id, currentTenantId(authentication)));
	}

	/**
	 * The bytes of one attachment, reached only through its case, so another tenant's attachment
	 * is not found rather than forbidden. Pictures and PDFs are handed over to be shown, since a
	 * browser can; everything else is handed over to be saved. The file name goes into the header
	 * escaped, whatever the sender called the file. Served from the trash as well: what was thrown
	 * away can be read until it is purged.
	 */
	@GetMapping("/{id}/attachments/{attachmentId}")
	ResponseEntity<byte[]> getAttachment(@PathVariable UUID id, @PathVariable UUID attachmentId,
			Authentication authentication) {
		Case aCase = ownCase(id, currentTenantId(authentication));
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
			@Valid @RequestBody ChangeClassificationRequest request, Authentication authentication) {
		UUID tenantId = currentTenantId(authentication);
		Case aCase = ownCase(id, tenantId);
		aCase.changeCategory(request.categoryId() == null ? null : ownCategory(request.categoryId(), tenantId));
		aCase.changeTier(request.toTier());
		return caseDetails.of(caseRepository.save(aCase));
	}

	/**
	 * A person taking note of a case, or taking that back. Not a deletion and not a correction of
	 * the triage: what the model said still stands, it has just been read by somebody.
	 */
	@PutMapping("/{id}/handled")
	@Transactional
	CaseDetailResponse markHandled(@PathVariable UUID id, @Valid @RequestBody MarkHandledRequest request,
			Authentication authentication) {
		Case aCase = ownCase(id, currentTenantId(authentication));
		aCase.markHandled(request.handled());
		return caseDetails.of(caseRepository.save(aCase));
	}

	/**
	 * Throws a selection away: it moves to the trash rather than leaving, because a mail cannot be
	 * fetched again once the mailbox has marked it read. Ids belonging to another tenant match
	 * nothing, so the answer is the same whether they exist or not.
	 */
	@DeleteMapping
	@ResponseStatus(HttpStatus.NO_CONTENT)
	@Transactional
	void deleteCases(@Valid @RequestBody DeleteCasesRequest request, Authentication authentication) {
		List<Case> own = ownCases(request.ids(), currentTenantId(authentication));
		own.forEach(Case::moveToTrash);
		caseRepository.saveAll(own);
	}

	/** Back out of the trash, to where the case was: the archive if it was worked through. */
	@PutMapping("/restore")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	@Transactional
	void restoreCases(@Valid @RequestBody DeleteCasesRequest request, Authentication authentication) {
		List<Case> own = ownCases(request.ids(), currentTenantId(authentication));
		own.forEach(Case::restore);
		caseRepository.saveAll(own);
	}

	/**
	 * Deletes a selection for good; the trash asks before it gets here. Only from the trash: what
	 * is still in the inbox has been thrown away by nobody, and this cannot be undone.
	 */
	@DeleteMapping("/purge")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	@Transactional
	void purgeCases(@Valid @RequestBody DeleteCasesRequest request, Authentication authentication) {
		List<UUID> inTheTrash = ownCases(request.ids(), currentTenantId(authentication)).stream()
				.filter(aCase -> aCase.getDeletedAt() != null).map(Case::getId).toList();
		if (!inTheTrash.isEmpty()) {
			caseRepository.deleteByTenantIdAndIdIn(currentTenantId(authentication), inTheTrash);
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

	private CaseCategory ownCategory(UUID id, UUID tenantId) {
		return caseCategoryRepository.findById(id)
				.filter(category -> category.getTenant().getId().equals(tenantId))
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
	}

	private UUID currentTenantId(Authentication authentication) {
		return appUserRepository.findUniqueByUsernameIgnoreCase(authentication.getName())
				.map(AppUser::getTenant)
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED))
				.getId();
	}
}
