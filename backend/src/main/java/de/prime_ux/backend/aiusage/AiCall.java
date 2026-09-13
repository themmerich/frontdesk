package de.prime_ux.backend.aiusage;

import de.prime_ux.backend.cases.Case;
import de.prime_ux.backend.tenants.Tenant;
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
 * One call to the model: what it was for, which model answered, how many tokens went in and
 * out, and what that was worth at the time. Written once and never changed.
 *
 * <p>The case is optional and only a pointer: a key test has none, and a purged case leaves the
 * row behind with the pointer cleared.
 */
@Entity
@Table(name = "ai_calls")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class AiCall {

	@Id
	@UuidGenerator
	private UUID id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "tenant_id")
	private Tenant tenant;

	@ManyToOne(fetch = FetchType.LAZY)
	@JoinColumn(name = "case_id")
	private Case mailCase;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	private AiCallKind kind;

	@Column(nullable = false)
	private String model;

	@Column(name = "input_tokens", nullable = false)
	private long inputTokens;

	@Column(name = "output_tokens", nullable = false)
	private long outputTokens;

	/** Null when the model had no price when the call was made. */
	@Column(name = "cost_usd", precision = 12, scale = 6)
	private BigDecimal costUsd;

	@Column(name = "called_at", nullable = false)
	private Instant calledAt;

	public AiCall(Tenant tenant, Case mailCase, AiCallKind kind, String model, long inputTokens, long outputTokens,
			BigDecimal costUsd, Instant calledAt) {
		this.tenant = tenant;
		this.mailCase = mailCase;
		this.kind = kind;
		this.model = model;
		this.inputTokens = inputTokens;
		this.outputTokens = outputTokens;
		this.costUsd = costUsd;
		this.calledAt = calledAt;
	}
}
