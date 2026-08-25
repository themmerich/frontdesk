package de.prime_ux.backend.triage;

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
import java.time.Instant;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.UuidGenerator;

/**
 * One kind of mail a tenant receives, and the tier every mail of that kind goes to. The
 * description is not documentation: it goes into the prompt verbatim and is what tells the model
 * when this category applies.
 */
@Entity
@Table(name = "case_categories")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class CaseCategory {

	@Id
	@UuidGenerator
	private UUID id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "tenant_id")
	private Tenant tenant;

	// What the model returns; the name is free text and would break matching on
	// every rewording.
	@Column(nullable = false)
	private String code;

	@Column(nullable = false)
	private String name;

	@Column(nullable = false)
	private String description;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	private CaseTier tier;

	// Order in the list and in the prompt, so both read the same way.
	@Column(name = "sort_order", nullable = false)
	private int sortOrder;

	// An inactive category is left out of the prompt but keeps the cases already
	// classified as such.
	@Column(nullable = false)
	private boolean active;

	@Column(name = "created_at", nullable = false)
	private Instant createdAt;

	public CaseCategory(Tenant tenant, String code, String name, String description, CaseTier tier, int sortOrder) {
		this.tenant = tenant;
		this.code = code;
		this.name = name;
		this.description = description;
		this.tier = tier;
		this.sortOrder = sortOrder;
		this.active = true;
		this.createdAt = Instant.now();
	}
}
