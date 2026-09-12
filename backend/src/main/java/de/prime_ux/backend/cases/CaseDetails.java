package de.prime_ux.backend.cases;

import de.prime_ux.backend.users.AppUser;
import de.prime_ux.backend.users.AppUserRepository;
import java.util.List;
import org.springframework.stereotype.Service;

/**
 * Puts a case's detail response together: the case itself, what is attached to it and what has
 * happened to it, both of which live in tables of their own. Every endpoint that answers with a
 * case's detail — reading it, correcting it, drafting a reply to it, sending one — goes through
 * here, so none of them forgets a part and hands the page a case without it.
 */
@Service
public class CaseDetails {

	private final CaseAttachmentRepository caseAttachmentRepository;
	private final CaseEventRepository caseEventRepository;
	private final CaseEvents caseEvents;
	private final AppUserRepository appUserRepository;

	public CaseDetails(CaseAttachmentRepository caseAttachmentRepository, CaseEventRepository caseEventRepository,
			CaseEvents caseEvents, AppUserRepository appUserRepository) {
		this.caseAttachmentRepository = caseAttachmentRepository;
		this.caseEventRepository = caseEventRepository;
		this.caseEvents = caseEvents;
		this.appUserRepository = appUserRepository;
	}

	public CaseDetailResponse of(Case aCase) {
		List<AttachmentResponse> attachments = caseAttachmentRepository
				.findAllByMailCaseIdOrderByPosition(aCase.getId()).stream().map(AttachmentResponse::from).toList();
		List<CaseEventResponse> events = caseEventRepository.findAllByMailCaseIdOrderByOccurredAtAsc(aCase.getId())
				.stream().map(event -> CaseEventResponse.from(event, caseEvents.detailsOf(event))).toList();
		return CaseDetailResponse.from(aCase, attachments, sentByNameOf(aCase), events);
	}

	/**
	 * Whoever sent the reply, by name. Read through the repository: the case may have been loaded
	 * outside a transaction, and a lazy reference gives up nothing but its id there.
	 */
	private String sentByNameOf(Case aCase) {
		if (aCase.getSentBy() == null) {
			return null;
		}
		return appUserRepository.findById(aCase.getSentBy().getId()).map(CaseEvents::nameOf).orElse(null);
	}
}
