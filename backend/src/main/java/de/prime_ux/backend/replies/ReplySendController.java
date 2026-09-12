package de.prime_ux.backend.replies;

import de.prime_ux.backend.cases.Case;
import de.prime_ux.backend.cases.CaseDetailResponse;
import de.prime_ux.backend.cases.CaseDetails;
import de.prime_ux.backend.cases.CaseRepository;
import de.prime_ux.backend.users.AppUser;
import de.prime_ux.backend.users.AppUserRepository;
import java.util.UUID;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

/**
 * The one button that lets a reply leave the house. Every signed-in user may press it: answering
 * mail is what the inbox is for, and whoever presses it has read the reply — that is the
 * approval.
 */
@RestController
@RequestMapping("/api/cases/{id}/send")
@Slf4j
class ReplySendController {

	private final CaseRepository caseRepository;
	private final CaseDetails caseDetails;
	private final AppUserRepository appUserRepository;
	private final ReplySender replySender;

	ReplySendController(CaseRepository caseRepository, CaseDetails caseDetails, AppUserRepository appUserRepository,
			ReplySender replySender) {
		this.caseRepository = caseRepository;
		this.caseDetails = caseDetails;
		this.appUserRepository = appUserRepository;
		this.replySender = replySender;
	}

	/**
	 * Sends the reply as it stands and answers with the case as it now stands. What cannot be sent
	 * is said as a conflict with the reason; a mail server that could not be reached is the
	 * upstream's failure, not the request's, and is said so.
	 */
	@PostMapping
	CaseDetailResponse send(@PathVariable UUID id, Authentication authentication) {
		AppUser person = currentUser(authentication);
		Case aCase = ownCase(id, person);
		try {
			return caseDetails.of(replySender.send(aCase, person));
		} catch (ReplyRefusedException e) {
			throw new ResponseStatusException(HttpStatus.CONFLICT, e.getMessage(), e);
		} catch (ReplySendException e) {
			log.warn("Could not send the reply to case {}: {}", id, e.getMessage(), e);
			throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "the reply could not be sent", e);
		}
	}

	/** A case of another tenant is not found rather than forbidden — the answer must not say that it exists. */
	private Case ownCase(UUID id, AppUser person) {
		UUID tenantId = person.getTenant().getId();
		return caseRepository.findWithCategoryById(id)
				.filter(candidate -> candidate.getTenant().getId().equals(tenantId))
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
	}

	private AppUser currentUser(Authentication authentication) {
		return appUserRepository.findUniqueByUsernameIgnoreCase(authentication.getName())
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED));
	}
}
