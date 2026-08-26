package de.prime_ux.backend.aisettings;

import de.prime_ux.backend.crypto.EncryptedStringConverter;
import de.prime_ux.backend.tenants.Tenant;
import jakarta.persistence.Column;
import jakarta.persistence.Convert;
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
 * A tenant's own access to the AI provider. Null means it has none and runs on the platform's
 * credentials, which is where every tenant starts.
 *
 * <p>Bringing an own key is not a convenience but a decision about who is billed: the tenant then
 * has its own contract with Anthropic and sees its own invoice.
 */
@Entity
@Table(name = "tenant_ai_settings")
@Getter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
public class TenantAiSettings {

	@Id
	@UuidGenerator
	private UUID id;

	@ManyToOne(fetch = FetchType.LAZY, optional = false)
	@JoinColumn(name = "tenant_id")
	private Tenant tenant;

	// Encrypted at rest like the mailbox password: this one costs money when it
	// leaks, and a database dump must not hand it over.
	@Convert(converter = EncryptedStringConverter.class)
	@Column(name = "api_key")
	private String apiKey;

	@Column(name = "created_at", nullable = false)
	private Instant createdAt;

	@Column(name = "updated_at", nullable = false)
	private Instant updatedAt;

	public TenantAiSettings(Tenant tenant) {
		this.tenant = tenant;
		this.createdAt = Instant.now();
		this.updatedAt = Instant.now();
	}

	/** Null or blank clears the key, which puts the tenant back on the platform's credentials. */
	public void useApiKey(String apiKey) {
		this.apiKey = apiKey == null || apiKey.isBlank() ? null : apiKey;
		this.updatedAt = Instant.now();
	}

	public boolean hasApiKey() {
		return this.apiKey != null;
	}
}
