package de.prime_ux.backend.cases;

import de.prime_ux.backend.tenants.Tenant;
import de.prime_ux.backend.triage.CaseCategory;
import de.prime_ux.backend.triage.CaseTier;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.UuidGenerator;

/**
 * A case ("Vorgang") — the central entity of frontdesk. Every ingested mail becomes a case and
 * later travels through triage, drafting, and approval. The case holds the facts about the mail
 * that opened it and the verdict on it; the mails themselves — the opening one, what followed,
 * what went out — are its {@link CaseMessage}s.
 */
@Entity
@Table(name = "cases")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Case {

	@Id
	@UuidGenerator
	private UUID id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "tenant_id")
	private Tenant tenant;

	@Column(name = "message_id")
	private String messageId;

	@Column(nullable = false)
	private String sender;

	// The tenant address the mail was sent to (info@, rechnung@, ...); null when
	// the mail carries no usable recipient header.
	@Column
	private String recipient;

	@Column(nullable = false)
	private String subject;

	// When the opening mail came in. The dashboard counts arrivals by it.
	@Column(name = "received_at", nullable = false)
	private Instant receivedAt;

	// When the conversation last moved, in either direction: the list sorts by it.
	@Column(name = "last_message_at", nullable = false)
	private Instant lastMessageAt;

	@Column(name = "ingested_at", nullable = false)
	private Instant ingestedAt;

	@Column(name = "has_attachments", nullable = false)
	private boolean hasAttachments;

	@Column(name = "size_bytes", nullable = false)
	private long sizeBytes;

	// The triage's verdict; null until it ran, which is how the runner finds the
	// cases still waiting for it.
	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "category_id")
	private CaseCategory category;

	@Enumerated(EnumType.STRING)
	@Column
	private CaseTier tier;

	// The model's own certainty, kept so the threshold can be tuned against
	// reality rather than guessed.
	@Column
	private BigDecimal confidence;

	@Column(name = "triaged_at")
	private Instant triagedAt;

	// When a person took note of the case. Null while it is still waiting to be
	// looked at, which is how the review finds what is left to work through.
	@Column(name = "handled_at")
	private Instant handledAt;

	// When somebody threw the case away. It then sits in the trash rather than
	// being gone: a mail cannot be fetched again once the mailbox marked it read.
	@Column(name = "deleted_at")
	private Instant deletedAt;

	// The model's one-sentence answer to "what does the sender want?".
	@Column
	private String summary;

	// The reply as the model wrote it, kept so it can be measured later how much
	// people had to change. Null when nobody asked the model, or a person wrote
	// the draft from scratch.
	@Column(name = "draft_generated_text")
	private String draftGeneratedText;

	// The next reply as it stands: what a person edits, and what the send button
	// sends. Null means the case has no draft, which is how the runner finds the
	// cases still waiting for one; cleared again once the reply went out.
	@Column(name = "draft_text")
	private String draftText;

	@Column(name = "draft_generated_at")
	private Instant draftGeneratedAt;

	@Column(name = "draft_updated_at")
	private Instant draftUpdatedAt;

	/** A case as its opening mail makes it; the mail itself goes in as the first message. */
	public Case(Tenant tenant, String messageId, String sender, String recipient, String subject, Instant receivedAt,
			boolean hasAttachments, long sizeBytes) {
		this.tenant = tenant;
		this.messageId = messageId;
		this.sender = sender;
		this.recipient = recipient;
		this.subject = subject;
		this.receivedAt = receivedAt;
		this.lastMessageAt = receivedAt;
		this.ingestedAt = Instant.now();
		this.hasAttachments = hasAttachments;
		this.sizeBytes = sizeBytes;
	}

	/**
	 * The customer wrote again. Whatever was settled is open again: the case goes back into the
	 * inbox, and the paperclip stays on once anything in the conversation had an attachment.
	 * Category, tier and a reply somebody started to write are left as they are. Refused in the
	 * trash — what was thrown away does not come back through the customer.
	 */
	public void receiveFollowUp(Instant receivedAt, boolean withAttachments) {
		requireNotTrashed();
		this.handledAt = null;
		this.lastMessageAt = receivedAt;
		this.hasAttachments = this.hasAttachments || withAttachments;
	}

	/**
	 * A person overruling the triage. Only the tier moves: the category, the summary and the
	 * confidence stay what the model said, because they still describe the classification it made
	 * — what changed is what happens with the case, and that is the tenant's call.
	 */
	public void changeTier(CaseTier tier) {
		this.tier = tier;
	}

	/**
	 * A person filing the case under another category, or under none at all. The tier stays where
	 * it is: which category a mail belongs to and what happens with it are two decisions, and a
	 * correction to the one is not a correction to the other.
	 */
	public void changeCategory(CaseCategory category) {
		this.category = category;
	}

	/**
	 * A person taking note of a case, or taking that back. The moment stands where a flag would
	 * do, because "since when" is what gets asked as soon as two people work the same inbox.
	 *
	 * <p>Marking an already handled case again leaves the first moment where it is: it is still
	 * the same taking note, and the second click says nothing new.
	 */
	public void markHandled(boolean handled) {
		if (!handled) {
			this.handledAt = null;
		}
		else if (this.handledAt == null) {
			this.handledAt = Instant.now();
		}
	}

	/**
	 * Thrown away, or fetched back out of the trash. The row stays either way — what leaves for
	 * good leaves through the repository, and only from the trash.
	 *
	 * <p>Throwing away says nothing about whether the case was worked through: it keeps its
	 * handled moment, so a case fetched back lands where it was, in the inbox or in the archive.
	 */
	public void moveToTrash() {
		if (this.deletedAt == null) {
			this.deletedAt = Instant.now();
		}
	}

	public void restore() {
		this.deletedAt = null;
	}

	/**
	 * Records what the triage made of this case. The category may be null when the model found
	 * nothing that fits; the tier never is, because every case has to land somewhere.
	 */
	public void applyTriage(CaseCategory category, CaseTier tier, BigDecimal confidence, String summary) {
		this.category = category;
		this.tier = tier;
		this.confidence = confidence;
		this.summary = summary;
		this.triagedAt = Instant.now();
	}

	/** Whether there is a reply to read: the current text, however it came to be. */
	public boolean hasDraft() {
		return this.draftText != null;
	}

	/**
	 * What the model wrote, replacing whatever draft there was — edits included. Both texts start
	 * out the same; they part ways with the first edit.
	 *
	 * <p>Refused for a case in the trash: nobody answers a mail that was thrown away, and the
	 * runner never asks for one, so this only guards the button.
	 */
	public void applyDraft(String text) {
		requireNotTrashed();
		Instant now = Instant.now();
		this.draftGeneratedText = text;
		this.draftText = text;
		this.draftGeneratedAt = now;
		this.draftUpdatedAt = now;
	}

	/**
	 * A person's version of the reply. What the model wrote stays where it is — that is the point
	 * of keeping it — and a person may write a draft where the model never did.
	 */
	public void editDraft(String text) {
		requireNotTrashed();
		this.draftText = text;
		this.draftUpdatedAt = Instant.now();
	}

	/**
	 * The reply went out and is a message of the conversation now, so the box is emptied for the
	 * next one. Sending is also taking note: the case leaves the inbox for the archive, unless
	 * somebody ticked it off before.
	 */
	public void markSent(Instant sentAt) {
		requireNotTrashed();
		this.draftText = null;
		this.draftGeneratedText = null;
		this.draftGeneratedAt = null;
		this.draftUpdatedAt = null;
		this.lastMessageAt = sentAt;
		if (this.handledAt == null) {
			this.handledAt = sentAt;
		}
	}

	private void requireNotTrashed() {
		if (this.deletedAt != null) {
			throw new IllegalStateException("A case in the trash gets no draft");
		}
	}
}
