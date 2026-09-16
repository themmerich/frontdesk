package de.prime_ux.backend.cases;

/**
 * What can happen to a case, as the trail writes it down. The names are stored as they are; the
 * API hands them out in lower case, like the tiers.
 */
public enum CaseEventType {
	/** The mail became a case. */
	INGESTED,
	/** The customer wrote again; the mail joined the case's conversation. */
	FOLLOW_UP_RECEIVED,
	/** The triage run judged the case; the model is the actor, so there is none. */
	TRIAGED,
	/** A person changed the category or the tier. */
	CLASSIFICATION_CORRECTED,
	/** The model wrote a reply, on its own or because a person asked. */
	DRAFT_GENERATED,
	/** A person saved an edited reply. */
	DRAFT_EDITED,
	/**
	 * An internal note was removed. Writing one and changing one are not recorded: the note
	 * carries its own author and moment and says when it was edited, so an entry would only
	 * repeat what stands beside it. Removing leaves nothing behind, which is why this one does.
	 */
	NOTE_DELETED,
	/** Somebody took the case, or handed it to a colleague. */
	ASSIGNED,
	/** The case belongs to nobody again. */
	UNASSIGNED,
	/** Ticked off by hand. */
	HANDLED,
	/** Taken back into the inbox. */
	REOPENED,
	/** Thrown away. */
	TRASHED,
	/** Fetched back out of the trash. */
	RESTORED,
	/** The reply went out. */
	SENT
}
