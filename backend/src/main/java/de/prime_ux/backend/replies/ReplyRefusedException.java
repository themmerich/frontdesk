package de.prime_ux.backend.replies;

/**
 * Nothing was tried, because the case is not one a reply can go out for: in the trash, without
 * a draft, sent already, or with a tenant that has no mail server to send through. The message
 * says which.
 */
public class ReplyRefusedException extends RuntimeException {

	public ReplyRefusedException(String message) {
		super(message);
	}
}
