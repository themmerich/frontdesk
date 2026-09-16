package de.prime_ux.backend.cases;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * What somebody writes on a case for their colleagues. Bounded because a note is a remark, not a
 * document; blank because an empty note says nothing and would only clutter the case.
 */
record CaseNoteRequest(@NotBlank @Size(max = 4000) String text) {

	String trimmedText() {
		return text == null ? null : text.trim();
	}
}
