package de.prime_ux.backend.aiusage;

/** What a call to the model was for. */
public enum AiCallKind {
	/** Classifying a case into a category and a tier. */
	TRIAGE,
	/** Writing or revising a reply draft. */
	DRAFT,
	/** Trying a tenant's own key out on the settings page. */
	KEY_TEST
}
