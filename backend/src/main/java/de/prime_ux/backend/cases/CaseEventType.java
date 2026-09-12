package de.prime_ux.backend.cases;

/**
 * What can happen to a case, as the trail writes it down. The names are stored as they are; the
 * API hands them out in lower case, like the tiers.
 */
public enum CaseEventType {
	/** The mail became a case. */
	INGESTED,
	/** The triage run judged the case; the model is the actor, so there is none. */
	TRIAGED,
	/** A person changed the category or the tier. */
	CLASSIFICATION_CORRECTED,
	/** The model wrote a reply, on its own or because a person asked. */
	DRAFT_GENERATED,
	/** A person saved an edited reply. */
	DRAFT_EDITED,
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
