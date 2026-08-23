package de.prime_ux.backend.tenants;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.OneToOne;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.UUID;
import lombok.AccessLevel;
import lombok.Getter;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.UuidGenerator;

/**
 * A tenant's company logo. Deliberately its own table (see V9): the tenant row travels with
 * almost every request, the image must not.
 */
@Entity
@Table(name = "tenant_logos")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class TenantLogo {

	@Id
	@UuidGenerator
	private UUID id;

	@OneToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "tenant_id")
	private Tenant tenant;

	@Column(nullable = false)
	private byte[] image;

	@Column(name = "content_type", nullable = false)
	private String contentType;

	@Column(name = "updated_at", nullable = false)
	private Instant updatedAt;

	public TenantLogo(Tenant tenant, byte[] image, String contentType) {
		this.tenant = tenant;
		this.image = image;
		this.contentType = contentType;
		this.updatedAt = Instant.now();
	}

	public void replace(byte[] image, String contentType) {
		this.image = image;
		this.contentType = contentType;
		this.updatedAt = Instant.now();
	}
}
