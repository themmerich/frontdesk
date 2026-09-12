package de.prime_ux.backend.cases;

import de.prime_ux.backend.triage.CaseCategory;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/**
 * One case with everything the detail view shows. Separate from the list's shape because of the
 * body: sending the full text of every mail just to fill a table would be paid for on every
 * reload, and the list never shows it. The attachments come along as metadata only; their bytes
 * have an endpoint of their own. The trail comes along whole, oldest step first.
 */
public record CaseDetailResponse(UUID id, String sender, String recipient, String subject, String bodyText,
		String bodyHtml, Instant receivedAt, boolean hasAttachments, long sizeBytes, String summary, UUID categoryId,
		String categoryName, String categoryColor, String tier, BigDecimal confidence, Instant handledAt,
		Instant deletedAt, String draftText, Instant draftGeneratedAt, Instant draftUpdatedAt,
		List<AttachmentResponse> attachments, Instant sentAt, String sentByName, List<CaseEventResponse> events) {

	/**
	 * @param sentByName the name of whoever sent the reply, resolved by the caller: the case holds
	 *                   a lazy reference that gives up nothing but its id outside a transaction
	 */
	public static CaseDetailResponse from(Case aCase, List<AttachmentResponse> attachments, String sentByName,
			List<CaseEventResponse> events) {
		CaseCategory category = aCase.getCategory();
		return new CaseDetailResponse(aCase.getId(), aCase.getSender(), aCase.getRecipient(), aCase.getSubject(),
				aCase.getBodyText(), aCase.getBodyHtml(), aCase.getReceivedAt(), aCase.isHasAttachments(), aCase.getSizeBytes(),
				aCase.getSummary(), category == null ? null : category.getId(),
				category == null ? null : category.getName(),
				category == null || category.getColor() == null ? null
						: category.getColor().name().toLowerCase(Locale.ROOT),
				aCase.getTier() == null ? null : aCase.getTier().name().toLowerCase(Locale.ROOT),
				aCase.getConfidence(), aCase.getHandledAt(), aCase.getDeletedAt(),
				// The reply as it stands, and when the model wrote it and a person last touched
				// it. What the model wrote stays in the database; the page has no use for it.
				aCase.getDraftText(), aCase.getDraftGeneratedAt(), aCase.getDraftUpdatedAt(), attachments,
				aCase.getSentAt(), sentByName, events);
	}
}
