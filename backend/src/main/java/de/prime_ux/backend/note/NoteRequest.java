package de.prime_ux.backend.note;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Validated payload for creating or updating a note. */
public record NoteRequest(
	@NotBlank @Size(max = 200) String title,
	@NotBlank String content
) {}
