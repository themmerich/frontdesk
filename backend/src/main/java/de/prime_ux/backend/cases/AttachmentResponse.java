package de.prime_ux.backend.cases;

import de.prime_ux.backend.cases.CaseAttachmentRepository.AttachmentSummary;
import java.util.UUID;

/**
 * One attachment as the detail page lists it: everything but the bytes, which have an endpoint of
 * their own. {@code inline} and {@code contentId} let the page put a signature's logo back into
 * the HTML body instead of into the list.
 */
public record AttachmentResponse(UUID id, String fileName, String contentType, long sizeBytes, boolean inline,
		String contentId) {

	public static AttachmentResponse from(AttachmentSummary attachment) {
		return new AttachmentResponse(attachment.getId(), attachment.getFileName(), attachment.getContentType(),
				attachment.getSizeBytes(), attachment.isInline(), attachment.getContentId());
	}
}
