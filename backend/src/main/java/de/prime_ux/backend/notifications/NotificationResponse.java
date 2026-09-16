package de.prime_ux.backend.notifications;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * What the bell shows: how many things happened on this person's cases while they were not
 * looking, and the newest of them. The count is the badge; the items are the popover.
 *
 * @param unseenCount everything since the person last looked, however short the list is cut
 * @param items the newest of them, newest first
 */
public record NotificationResponse(long unseenCount, List<Item> items) {

	/**
	 * One thing that happened, and the case it happened on.
	 *
	 * @param type {@code assigned} or {@code follow_up_received}, lowercase like every enum here
	 * @param actorName who did it, or null for what the system did on its own
	 */
	public record Item(UUID caseId, String subject, String type, String actorName, Instant occurredAt) {
	}
}
