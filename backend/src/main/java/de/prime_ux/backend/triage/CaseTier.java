package de.prime_ux.backend.triage;

/**
 * How a case is meant to be handled after the triage. The three tiers of the review board:
 * frontdesk answers it by itself, it prepares an answer a human approves, or it stays untouched
 * because a person has to deal with it.
 */
public enum CaseTier {
	AUTOMATIC, DRAFT, MANUAL
}
