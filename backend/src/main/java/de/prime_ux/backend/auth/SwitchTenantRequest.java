package de.prime_ux.backend.auth;

import jakarta.validation.constraints.NotBlank;
import java.util.Locale;

/** Which tenant a super-user opens, by its Kennung. */
record SwitchTenantRequest(@NotBlank String slug) {

	String normalizedSlug() {
		return slug.strip().toLowerCase(Locale.ROOT);
	}
}
