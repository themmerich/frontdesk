package de.prime_ux.backend.cases;

import java.time.Instant;
import java.util.UUID;

/**
 * A note as the detail page shows it. The author travels as a name, not as an account: that is
 * what was written down, and it outlives the account.
 *
 * @param updatedAt null while the note stands as it was written; a moment once it was edited
 */
public record CaseNoteResponse(UUID id, String authorName, String text, Instant createdAt, Instant updatedAt,
		boolean own) {

	/**
	 * @param own whether the person reading wrote it — the one thing that decides whether the page
	 *        offers to edit or to delete it, decided here rather than by comparing names there
	 */
	static CaseNoteResponse from(CaseNote note, boolean own) {
		return new CaseNoteResponse(note.getId(), note.getAuthorName(), note.getText(), note.getCreatedAt(),
				note.getUpdatedAt(), own);
	}
}
