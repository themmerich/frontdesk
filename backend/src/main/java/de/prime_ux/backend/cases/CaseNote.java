package de.prime_ux.backend.cases;

import de.prime_ux.backend.users.AppUser;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.UuidGenerator;

/**
 * An internal note on a case: what one person tells another about it, and never the customer. An
 * aggregate keyed by the case, like the messages, the attachments and the trail.
 *
 * <p>Nothing here ever reaches a reply. The draft is what goes out, and the prompt that writes it
 * is built from the case and its messages; a note is neither, and two tests say so.
 *
 * <p>The author's name is copied when the note is written, the way the trail copies it: the
 * account may go, what was said stays.
 */
@Entity
@Table(name = "case_notes")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class CaseNote {

	@Id
	@UuidGenerator
	private UUID id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "case_id")
	private Case mailCase;

	/** Null once the account is gone; the name stays either way. */
	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "author_user_id")
	private AppUser author;

	@Column(name = "author_name", nullable = false)
	private String authorName;

	@Column(nullable = false)
	private String text;

	@Column(name = "created_at", nullable = false)
	private Instant createdAt;

	/** Set on an edit, so the page can say that the note is not as it was first written. */
	@Column(name = "updated_at")
	private Instant updatedAt;

	public CaseNote(Case mailCase, AppUser author, String authorName, String text) {
		this.mailCase = mailCase;
		this.author = author;
		this.authorName = authorName;
		this.text = text;
		this.createdAt = Instant.now();
	}

	/** Only the author edits a note, which the controller decides; here it is only written down. */
	public void edit(String text) {
		this.text = text;
		this.updatedAt = Instant.now();
	}

	/** Whether this note is that person's own — the one question its editing rests on. */
	public boolean isWrittenBy(AppUser person) {
		return this.author != null && person != null && this.author.getId().equals(person.getId());
	}
}
