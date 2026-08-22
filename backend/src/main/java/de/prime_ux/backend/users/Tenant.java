package de.prime_ux.backend.users;

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

	@Column(name = "created_at", nullable = false)
	private Instant createdAt;

	public Tenant(String name) {
		this.name = name;
		this.createdAt = Instant.now();
	}
}
