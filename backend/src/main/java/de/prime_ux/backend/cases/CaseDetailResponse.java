package de.prime_ux.backend.cases;

import de.prime_ux.backend.triage.CaseCategory;
import de.prime_ux.backend.users.AppUser;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/**
 * One case with everything the detail view shows. Separate from the list's shape because of the
 * conversation: sending every mail of every case just to fill a table would be paid for on every
 * reload, and the list never shows one. The messages come whole, oldest first, each with what
 * came attached to it; so does the trail.
 */
public record CaseDetailResponse(UUID id, String sender, String recipient, String subject, Instant receivedAt,
		boolean hasAttachments, long sizeBytes, String summary, UUID categoryId, String categoryName,
		String categoryColor, String tier, BigDecimal confidence, Instant handledAt, Instant deletedAt,
		String draftText, Instant draftGeneratedAt, Instant draftUpdatedAt, Instant lastMessageAt,
		UUID assigneeId, String assigneeName, List<MessageResponse> messages, List<CaseEventResponse> events) {

	public static CaseDetailResponse from(Case aCase, List<MessageResponse> messages, List<CaseEventResponse> events) {
		CaseCategory category = aCase.getCategory();
		AppUser assignee = aCase.getAssignee();
		return new CaseDetailResponse(aCase.getId(), aCase.getSender(), aCase.getRecipient(), aCase.getSubject(),
				aCase.getReceivedAt(), aCase.isHasAttachments(), aCase.getSizeBytes(), aCase.getSummary(),
				category == null ? null : category.getId(), category == null ? null : category.getName(),
				category == null || category.getColor() == null ? null
						: category.getColor().name().toLowerCase(Locale.ROOT),
				aCase.getTier() == null ? null : aCase.getTier().name().toLowerCase(Locale.ROOT),
				aCase.getConfidence(), aCase.getHandledAt(), aCase.getDeletedAt(),
				// The next reply as it stands, and when the model wrote it and a person last
				// touched it. What the model wrote stays in the database; the page has no use for it.
				aCase.getDraftText(), aCase.getDraftGeneratedAt(), aCase.getDraftUpdatedAt(), aCase.getLastMessageAt(),
				// Who has the case; the picker needs the key, the heading the name.
				assignee == null ? null : assignee.getId(),
				assignee == null ? null : CaseEvents.nameOf(assignee),
				messages, events);
	}
}
