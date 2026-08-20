package de.prime_ux.backend.cases;

import java.time.Instant;
import java.util.UUID;

public record CaseResponse(UUID id, String sender, String subject, Instant receivedAt, boolean hasAttachments,
		long sizeBytes) {

	static CaseResponse from(Case aCase) {
		return new CaseResponse(aCase.getId(), aCase.getSender(), aCase.getSubject(), aCase.getReceivedAt(),
				aCase.isHasAttachments(), aCase.getSizeBytes());
	}
}
