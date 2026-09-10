package de.prime_ux.backend.replies;

/** A draft that could not be obtained — the case stays without one and is tried again. */
public class ReplyDraftException extends RuntimeException {

	public ReplyDraftException(String message, Throwable cause) {
		super(message, cause);
	}
}
