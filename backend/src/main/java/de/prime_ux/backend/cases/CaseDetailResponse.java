package de.prime_ux.backend.cases;

import de.prime_ux.backend.triage.CaseCategory;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.Locale;
import java.util.UUID;

/**
 * One case with everything the detail view shows. Separate from the list's shape because of the
 * body: sending the full text of every mail just to fill a table would be paid for on every
 * reload, and the list never shows it.
 */
record CaseDetailResponse(UUID id, String sender, String recipient, String subject, String bodyText,
		Instant receivedAt, boolean hasAttachments, long sizeBytes, String summary, String categoryName,
		String categoryColor, String tier, BigDecimal confidence) {

	static CaseDetailResponse from(Case aCase) {
		CaseCategory category = aCase.getCategory();
		return new CaseDetailResponse(aCase.getId(), aCase.getSender(), aCase.getRecipient(), aCase.getSubject(),
				aCase.getBodyText(), aCase.getReceivedAt(), aCase.isHasAttachments(), aCase.getSizeBytes(),
				aCase.getSummary(), category == null ? null : category.getName(),
				category == null || category.getColor() == null ? null
						: category.getColor().name().toLowerCase(Locale.ROOT),
				aCase.getTier() == null ? null : aCase.getTier().name().toLowerCase(Locale.ROOT),
				aCase.getConfidence());
	}
}
