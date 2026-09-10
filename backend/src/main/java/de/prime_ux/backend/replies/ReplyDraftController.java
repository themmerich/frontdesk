package de.prime_ux.backend.replies;

import de.prime_ux.backend.cases.Case;
import de.prime_ux.backend.cases.CaseDetailResponse;
import de.prime_ux.backend.cases.CaseRepository;
import de.prime_ux.backend.users.AppUser;
import de.prime_ux.backend.users.AppUserRepository;

import jakarta.validation.Valid;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * The draft of one case, as the detail page works with it: written by the model on request, and
 * saved as a person left it. Every signed-in user may do both — answering mail is what the inbox
 * is for, not an admin's job.
 */
@RestController
@RequestMapping("/api/cases/{id}/draft")
class ReplyDraftController {

	private final CaseRepository caseRepository;
	private final AppUserRepository appUserRepository;
	private final ReplyDraftProcessor replyDraftProcessor;

	ReplyDraftController(CaseRepository caseRepository, AppUserRepository appUserRepository,
			ReplyDraftProcessor replyDraftProcessor) {
		this.caseRepository = caseRepository;
		this.appUserRepository = appUserRepository;
		this.replyDraftProcessor = replyDraftProcessor;
	}

	/**
	 * Writes the draft now, whatever the tier, and in place of one that is already there. The
	 * model answering nothing is the upstream's failure, not the request's, and is said so.
	 */
	@PostMapping
	@Transactional
	CaseDetailResponse generate(@PathVariable UUID id, Authentication authentication) {
		Case aCase = ownDraftableCase(id, authentication);
		try {
			return CaseDetailResponse.from(replyDraftProcessor.draftNow(aCase));
		} catch (ReplyDraftException e) {
			throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "the model gave no draft", e);
		}
	}

	/**
	 * The text as a person left it. What the model wrote stays beside it, so it can be measured
	 * later how much had to be changed.
	 */
	@PutMapping
	@Transactional
	CaseDetailResponse edit(@PathVariable UUID id, @Valid @RequestBody EditDraftRequest request,
			Authentication authentication) {
		Case aCase = ownDraftableCase(id, authentication);
		aCase.editDraft(request.text());
		return CaseDetailResponse.from(caseRepository.save(aCase));
	}

	/**
	 * A case of another tenant is not found rather than forbidden — the answer must not say that
	 * it exists. A case in the trash is found, but nobody answers a mail that was thrown away.
	 */
	private Case ownDraftableCase(UUID id, Authentication authentication) {
		UUID tenantId = currentTenantId(authentication);
		Case aCase = caseRepository.findWithCategoryById(id)
				.filter(candidate -> candidate.getTenant().getId().equals(tenantId))
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
		if (aCase.getDeletedAt() != null) {
			throw new ResponseStatusException(HttpStatus.CONFLICT, "a case in the trash gets no draft");
		}
		return aCase;
	}

	private UUID currentTenantId(Authentication authentication) {
		return appUserRepository.findUniqueByUsernameIgnoreCase(authentication.getName())
				.map(AppUser::getTenant)
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED))
				.getId();
	}
}
