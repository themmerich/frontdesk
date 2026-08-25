package de.prime_ux.backend.triage;

/** A classification that could not be obtained — the case stays untriaged and is retried. */
public class TriageException extends RuntimeException {

	public TriageException(String message, Throwable cause) {
		super(message, cause);
	}
}
