package de.prime_ux.backend.cases;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.UuidGenerator;

/**
 * A case ("Vorgang") — the central entity of frontdesk. Every ingested mail becomes a case and
 * later travels through triage, drafting, and approval.
 */
@Entity
@Table(name = "cases")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Case {

	@Id
	@UuidGenerator
	private UUID id;

	@Column(name = "message_id")
	private String messageId;

	@Column(nullable = false)
	private String sender;

	@Column(nullable = false)
	private String subject;

	@Column(name = "body_text", nullable = false)
	private String bodyText;

	@Column(name = "received_at", nullable = false)
	private Instant receivedAt;

	@Column(name = "ingested_at", nullable = false)
	private Instant ingestedAt;

	@Column(name = "has_attachments", nullable = false)
	private boolean hasAttachments;

	@Column(name = "size_bytes", nullable = false)
	private long sizeBytes;

	public Case(String messageId, String sender, String subject, String bodyText, Instant receivedAt,
			boolean hasAttachments, long sizeBytes) {
		this.messageId = messageId;
		this.sender = sender;
		this.subject = subject;
		this.bodyText = bodyText;
		this.receivedAt = receivedAt;
		this.ingestedAt = Instant.now();
		this.hasAttachments = hasAttachments;
		this.sizeBytes = sizeBytes;
	}
}
