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

	public Case(Tenant tenant, String messageId, String sender, String recipient, String subject, String bodyText,
			Instant receivedAt, boolean hasAttachments, long sizeBytes) {
		this.tenant = tenant;
		this.messageId = messageId;
		this.sender = sender;
		this.recipient = recipient;
		this.subject = subject;
		this.bodyText = bodyText;
		this.receivedAt = receivedAt;
		this.ingestedAt = Instant.now();
		this.hasAttachments = hasAttachments;
		this.sizeBytes = sizeBytes;
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
}
