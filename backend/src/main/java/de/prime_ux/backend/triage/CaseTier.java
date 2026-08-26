package de.prime_ux.backend.triage;

/**
 * How a case is meant to be handled after the triage. Two questions, resolved into one ladder:
 * does this need an answer, and who writes it.
 *
 * <p>The set is fixed on purpose. A tier is not a label but a path the product takes — drafting,
 * approving, sending, archiving all hang off these five. What a tenant configures is which
 * category lands on which tier, never which tiers exist.
 */
public enum CaseTier {

	/** Needs an answer, and frontdesk writes and sends it by itself. */
	AUTOMATIC,

	/** Needs an answer; frontdesk prepares it, a person approves it. */
	DRAFT,

	/** Needs an answer, and a person writes it. */
	MANUAL,

	/** Needs no answer, but somebody should have seen it — an order confirmation, a delivery note. */
	INFO,

	/** Needs no answer and nobody has to read it: advertising, cold calls, newsletters. */
	IGNORE;

	/**
	 * Where a case goes when the model was not certain enough. Not one step down a line but one
	 * step towards a person: every tier converges on {@link #MANUAL}, so uncertainty can never
	 * make a mail disappear unseen.
	 */
	public CaseTier whenUncertain() {
		return switch (this) {
			case AUTOMATIC -> DRAFT;
			case DRAFT, MANUAL, INFO -> MANUAL;
			// Not straight to manual: what was taken for advertising is worth a
			// glance before it lands in somebody's queue as work.
			case IGNORE -> INFO;
		};
	}
}
