package de.prime_ux.backend.cases;

import de.prime_ux.backend.cases.CaseAttachmentRepository.AttachmentSummary;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;

/**
 * Puts a case's detail response together: the case itself, its conversation with what came
 * attached to each message, and what has happened to it — all of which live in tables of their
 * own. Every endpoint that answers with a case's detail — reading it, correcting it, drafting a
 * reply to it, sending one — goes through here, so none of them forgets a part and hands the page
 * a case without it.
 */
@Service
public class CaseDetails {

	private final CaseMessageRepository caseMessageRepository;
	private final CaseAttachmentRepository caseAttachmentRepository;
	private final CaseEventRepository caseEventRepository;
	private final CaseEvents caseEvents;

	public CaseDetails(CaseMessageRepository caseMessageRepository, CaseAttachmentRepository caseAttachmentRepository,
			CaseEventRepository caseEventRepository, CaseEvents caseEvents) {
		this.caseMessageRepository = caseMessageRepository;
		this.caseAttachmentRepository = caseAttachmentRepository;
		this.caseEventRepository = caseEventRepository;
		this.caseEvents = caseEvents;
	}

	public CaseDetailResponse of(Case aCase) {
		// All attachments of the case in one query, then dealt out to their messages.
		Map<UUID, List<AttachmentResponse>> attachmentsPerMessage = caseAttachmentRepository
				.findAllByMailCaseIdOrderByPosition(aCase.getId()).stream()
				.collect(Collectors.groupingBy(AttachmentSummary::getMessageId,
						Collectors.mapping(AttachmentResponse::from, Collectors.toList())));
		List<MessageResponse> messages = caseMessageRepository.findAllByMailCaseIdOrderByPositionAsc(aCase.getId())
				.stream()
				.map(message -> MessageResponse.from(message, attachmentsPerMessage.getOrDefault(message.getId(), List.of())))
				.toList();
		List<CaseEventResponse> events = caseEventRepository.findAllByMailCaseIdOrderByOccurredAtAsc(aCase.getId())
				.stream().map(event -> CaseEventResponse.from(event, caseEvents.detailsOf(event))).toList();
		return CaseDetailResponse.from(aCase, messages, events);
	}
}
