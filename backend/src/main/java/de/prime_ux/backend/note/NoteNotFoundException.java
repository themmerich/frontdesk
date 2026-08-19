package de.prime_ux.backend.note;

public class NoteNotFoundException extends RuntimeException {

	public NoteNotFoundException(Long id) {
		super("Note %d not found".formatted(id));
	}
}
