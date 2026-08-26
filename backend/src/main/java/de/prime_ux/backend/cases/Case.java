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
