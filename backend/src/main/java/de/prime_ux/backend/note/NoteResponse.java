package de.prime_ux.backend.note;

import java.time.Instant;

/** API representation of a note. */
public record NoteResponse(
	Long id,
	String title,
	String content,
	Instant createdAt,
	Instant updatedAt
) {

	static NoteResponse from(Note note) {
		return new NoteResponse(
			note.getId(),
			note.getTitle(),
			note.getContent(),
			note.getCreatedAt(),
			note.getUpdatedAt()
		);
	}
}
