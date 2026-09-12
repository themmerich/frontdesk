package de.prime_ux.backend.replies;

/**
 * The reply could not be handed to the mail server: connection, login, or the server saying no.
 * The case is left as it was; the person can try again.
 */
public class ReplySendException extends RuntimeException {

	public ReplySendException(String message, Throwable cause) {
		super(message, cause);
	}
}
