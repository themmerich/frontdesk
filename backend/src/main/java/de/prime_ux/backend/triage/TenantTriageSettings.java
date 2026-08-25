package de.prime_ux.backend.triage;

import de.prime_ux.backend.tenants.Tenant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
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
 * The triage knobs that apply to a whole tenant rather than to a single category. One row per
 * tenant.
 */
@Entity
@Table(name = "tenant_triage_settings")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class TenantTriageSettings {

	/**
	 * Below this, a case drops one tier — rather one draft too many than a wrong automatic
	 * answer. Deliberately cautious until real mails say otherwise.
	 */
	public static final BigDecimal DEFAULT_CONFIDENCE_THRESHOLD = new BigDecimal("0.80");

	@Id
	@UuidGenerator
	private UUID id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "tenant_id")
	private Tenant tenant;

	// Appended to the system prompt for this tenant's own peculiarities; empty
	// means the prompt stays as it is.
	@Column(name = "extra_instructions", nullable = false)
	private String extraInstructions;

	@Column(name = "confidence_threshold", nullable = false)
	private BigDecimal confidenceThreshold;

	@Column(name = "created_at", nullable = false)
	private Instant createdAt;

	public TenantTriageSettings(Tenant tenant, String extraInstructions, BigDecimal confidenceThreshold) {
		this.tenant = tenant;
		this.extraInstructions = extraInstructions;
		this.confidenceThreshold = confidenceThreshold;
		this.createdAt = Instant.now();
	}

	/** What a tenant starts with: no extra instructions, the cautious default threshold. */
	public static TenantTriageSettings defaults(Tenant tenant) {
		return new TenantTriageSettings(tenant, "", DEFAULT_CONFIDENCE_THRESHOLD);
	}
}
