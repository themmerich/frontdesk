package de.prime_ux.backend.cases;

import de.prime_ux.backend.triage.CaseCategory;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Locale;
import java.util.UUID;

/**
 * A case as the inbox shows it. Everything the triage produced is null until it looked at the
 * case; the tier travels lowercase, like every other enum on the wire.
 */
public record CaseResponse(UUID id, String sender, String recipient, String subject, Instant receivedAt,
		boolean hasAttachments, long sizeBytes, String summary, String categoryName, String categoryColor,
		String tier, BigDecimal confidence) {

	static CaseResponse from(Case aCase) {
		CaseCategory category = aCase.getCategory();
		return new CaseResponse(aCase.getId(), aCase.getSender(), aCase.getRecipient(), aCase.getSubject(),
				aCase.getReceivedAt(), aCase.isHasAttachments(), aCase.getSizeBytes(), aCase.getSummary(),
				category == null ? null : category.getName(),
				category == null || category.getColor() == null ? null
						: category.getColor().name().toLowerCase(Locale.ROOT),
				aCase.getTier() == null ? null : aCase.getTier().name().toLowerCase(Locale.ROOT),
				aCase.getConfidence());
	}
}
