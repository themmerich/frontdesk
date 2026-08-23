package de.prime_ux.backend.tenants;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.UuidGenerator;

/**
 * A tenant is one customer of frontdesk. Every user belongs to exactly one tenant, and all
 * business data will be scoped to a tenant so a single deployment can serve many customers.
 */
@Entity
@Table(name = "tenants")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Tenant {

	@Id
	@UuidGenerator
	private UUID id;

	@Column(nullable = false)
	private String name;

	// Address and contact data live on the headquarters branch; the tenant
	// keeps only its identity and branding.
	private String website;

	@Enumerated(EnumType.STRING)
	@Column(name = "logo_display", nullable = false)
	private LogoDisplay logoDisplay;

	/** Brand color as hex (#RRGGBB); the app's default primary color for this tenant's users. */
	@Column(name = "primary_color")
	private String primaryColor;

	@Column(name = "created_at", nullable = false)
	private Instant createdAt;

	public Tenant(String name) {
		this.name = name;
		this.logoDisplay = LogoDisplay.WITH_NAME;
		this.createdAt = Instant.now();
	}

	/** The name is the tenant's name everywhere — renaming here renames the tenant. */
	public void updateCompany(String name, String website, LogoDisplay logoDisplay, String primaryColor) {
		this.name = name;
		this.website = website;
		this.logoDisplay = logoDisplay;
		this.primaryColor = primaryColor;
	}
}
