package de.prime_ux.backend.tenants;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.Locale;

/**
 * What the Mandanten page sets about a tenant: the name, and the Kennung the login page asks
 * for. The Kennung is letters, digits and single dashes, stored lower-case whatever case it
 * arrives in; the page proposes one from the name and lets the person change it.
 */
record TenantRequest(
		@NotBlank @Size(max = 200) String name,
		@NotBlank @Size(max = 60) @Pattern(regexp = "^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$") String slug) {

	String trimmedName() {
		return name.strip();
	}

	String normalizedSlug() {
		return slug.strip().toLowerCase(Locale.ROOT);
	}
}
