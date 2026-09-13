package de.prime_ux.backend.cases;

import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/**
 * One message of the conversation as the detail page shows it, with what came attached to it.
 * The direction goes out in lower case, like every other enum on the wire.
 */
public record MessageResponse(UUID id, String direction, String sender, String recipient, String subject,
		String bodyText, String bodyHtml, Instant occurredAt, long sizeBytes, String sentByName,
		List<AttachmentResponse> attachments) {

	public static MessageResponse from(CaseMessage message, List<AttachmentResponse> attachments) {
		return new MessageResponse(message.getId(), message.getDirection().name().toLowerCase(Locale.ROOT),
				message.getSender(), message.getRecipient(), message.getSubject(), message.getBodyText(),
				message.getBodyHtml(), message.getOccurredAt(), message.getSizeBytes(), message.getSentByName(),
				attachments);
	}
}
