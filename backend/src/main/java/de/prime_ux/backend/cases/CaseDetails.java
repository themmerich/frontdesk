package de.prime_ux.backend.cases;

import org.springframework.stereotype.Service;

/**
 * Puts a case's detail response together: the case itself and what is attached to it, which
 * lives in a table of its own. Every endpoint that answers with a case's detail — reading it,
 * correcting it, drafting a reply to it — goes through here, so none of them forgets the
 * attachments and hands the page a case without them.
 */
@Service
public class CaseDetails {

	private final CaseAttachmentRepository caseAttachmentRepository;

	public CaseDetails(CaseAttachmentRepository caseAttachmentRepository) {
		this.caseAttachmentRepository = caseAttachmentRepository;
	}

	public CaseDetailResponse of(Case aCase) {
		return CaseDetailResponse.from(aCase, caseAttachmentRepository.findAllByMailCaseIdOrderByPosition(aCase.getId())
				.stream().map(AttachmentResponse::from).toList());
	}
}
