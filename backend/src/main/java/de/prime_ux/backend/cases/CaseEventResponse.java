package de.prime_ux.backend.cases;

import java.time.Instant;
import java.util.Locale;
import java.util.Map;

/**
 * One step of a case's trail as the detail page shows it. The type goes out in lower case, like
 * the tiers; the details are the object the step was written down with.
 */
public record CaseEventResponse(String type, Instant occurredAt, String actorName, Map<String, Object> details) {

	public static CaseEventResponse from(CaseEvent event, Map<String, Object> details) {
		return new CaseEventResponse(event.getType().name().toLowerCase(Locale.ROOT), event.getOccurredAt(),
				event.getActorName(), details);
	}
}
