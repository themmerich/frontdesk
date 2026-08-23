package de.prime_ux.backend.branches;

import de.prime_ux.backend.tenants.Tenant;

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
 * One site of a tenant's company, carrying its own address and contact data. At most one site per
 * tenant is the headquarters (enforced by a partial unique index); marking a new one demotes the
 * previous. A company without a headquarters is a valid, if unusual, state.
 */
@Entity
@Table(name = "branches")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class Branch {

	@Id
	@UuidGenerator
	private UUID id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "tenant_id")
	private Tenant tenant;

	@Column(nullable = false)
	private String name;

	@Column(name = "is_headquarters", nullable = false)
	private boolean headquarters;

	private String street;

	@Column(name = "postal_code")
	private String postalCode;

	private String city;

	private String country;

	private String phone;

	private String fax;

	private String email;

	@Column(name = "created_at", nullable = false)
	private Instant createdAt;

	public Branch(Tenant tenant, String name, boolean headquarters) {
		this.tenant = tenant;
		this.name = name;
		this.headquarters = headquarters;
		this.createdAt = Instant.now();
	}

	public void update(String name, boolean headquarters, String street, String postalCode, String city,
			String country, String phone, String fax, String email) {
		this.name = name;
		this.headquarters = headquarters;
		this.street = street;
		this.postalCode = postalCode;
		this.city = city;
		this.country = country;
		this.phone = phone;
		this.fax = fax;
		this.email = email;
	}

	/** Steps back so another site can become the headquarters. */
	public void demote() {
		this.headquarters = false;
	}
}
