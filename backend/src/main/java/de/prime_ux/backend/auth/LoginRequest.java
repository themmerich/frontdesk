package de.prime_ux.backend.auth;

import jakarta.validation.constraints.NotBlank;
import java.util.Locale;

/**
 * @param tenant the Kennung of the tenant to sign in to; blank means a super-user is signing in
 */
record LoginRequest(String tenant, @NotBlank String username, @NotBlank String password) {

	/** The Kennung as it is stored: trimmed and lower-cased; null when none was given. */
	String tenantSlug() {
		return tenant == null || tenant.isBlank() ? null : tenant.strip().toLowerCase(Locale.ROOT);
	}
}
