package de.prime_ux.backend.cases;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
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
 * One message of a case's conversation: the mail that opened it, a mail that followed, or a
 * reply that went out. An aggregate keyed by the case, like attachments and events: the case
 * keeps the facts about its opening mail for the list and the triage, and the conversation is
 * read where it is shown.
 */
@Entity
@Table(name = "case_messages")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class CaseMessage {

	@Id
	@UuidGenerator
	private UUID id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "case_id")
	private Case mailCase;

	/** Where the message stands in the conversation; the opening mail is 0. */
	@Column(nullable = false)
	private int position;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	private MessageDirection direction;

	/** The mail's Message-ID, theirs or ours: what a reply refers to in In-Reply-To and References. */
	@Column(name = "message_id")
	private String messageId;

	/** The customer's address for an incoming message, the mailbox's for an outgoing one. */
	@Column(nullable = false)
	private String sender;

	@Column
	private String recipient;

	@Column(nullable = false)
	private String subject;

	@Column(name = "body_text", nullable = false)
	private String bodyText;

	/** The mail as it was written, where it was written in HTML; outgoing messages are text. */
	@Column(name = "body_html")
	private String bodyHtml;

	/** Received, or sent. */
	@Column(name = "occurred_at", nullable = false)
	private Instant occurredAt;

	/** The raw size the server reported for an incoming mail; 0 for what went out. */
	@Column(name = "size_bytes", nullable = false)
	private long sizeBytes;

	/** Outgoing only: who pressed the button, by the name they had at the time. */
	@Column(name = "sent_by_name")
	private String sentByName;

	/**
	 * Incoming only: the mail said it was automated bulk, through a List-* header, a Precedence
	 * or an Auto-Submitted. Read while the headers are still there, because they are not stored.
	 */
	@Column(nullable = false)
	private boolean bulk;

	private CaseMessage(Case mailCase, int position, MessageDirection direction, String messageId, String sender,
			String recipient, String subject, String bodyText, String bodyHtml, Instant occurredAt, long sizeBytes,
			String sentByName, boolean bulk) {
		this.mailCase = mailCase;
		this.position = position;
		this.direction = direction;
		this.messageId = messageId;
		this.sender = sender;
		this.recipient = recipient;
		this.subject = subject;
		this.bodyText = bodyText;
		this.bodyHtml = bodyHtml;
		this.occurredAt = occurredAt;
		this.sizeBytes = sizeBytes;
		this.sentByName = sentByName;
		this.bulk = bulk;
	}

	/** A mail that came in, the opening one or a follow-up. */
	public static CaseMessage incoming(Case mailCase, int position, String messageId, String sender, String recipient,
			String subject, String bodyText, String bodyHtml, Instant receivedAt, long sizeBytes, boolean bulk) {
		return new CaseMessage(mailCase, position, MessageDirection.INCOMING, messageId, sender, recipient, subject,
				bodyText, bodyHtml, receivedAt, sizeBytes, null, bulk);
	}

	/** A reply that went out, from the mailbox, in somebody's name. */
	public static CaseMessage outgoing(Case mailCase, int position, String messageId, String sender, String recipient,
			String subject, String bodyText, Instant sentAt, String sentByName) {
		return new CaseMessage(mailCase, position, MessageDirection.OUTGOING, messageId, sender, recipient, subject,
				bodyText, null, sentAt, 0, sentByName, false);
	}

	public boolean isIncoming() {
		return this.direction == MessageDirection.INCOMING;
	}
}
