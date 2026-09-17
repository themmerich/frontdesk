package de.prime_ux.backend.cases;

/**
 * How a case reached the house. Everything but {@link #MAIL} is written down by hand — somebody
 * took a call, a fax came off the machine — and carries no address to answer to: what stands in
 * the sender of such a case is a person, not a mailbox.
 */
public enum CaseChannel {

	/** Came in through the mailbox, and can be answered the same way. */
	MAIL,

	PHONE,

	FAX,

	/** Anything else somebody wrote down: a visitor at the desk, a letter, a note from a colleague. */
	OTHER;

	/**
	 * Whether a reply can go out over this channel. Only mail carries an address; for the rest the
	 * answer happens wherever the request happened, and the case records it rather than sending it.
	 */
	public boolean canBeAnsweredByMail() {
		return this == MAIL;
	}
}
