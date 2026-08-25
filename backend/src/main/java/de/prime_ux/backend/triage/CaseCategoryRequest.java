package de.prime_ux.backend.triage;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.Locale;

/**
 * What an admin may set on a category. The code is not among it — it is derived from the name
 * once and then stays, because the model answers with it.
 *
 * <p>The description is required: it is the only thing telling the model when this category
 * applies, and an empty one would make the category unusable without saying so.
 */
record CaseCategoryRequest(@NotBlank @Size(max = 100) String name, @NotBlank @Size(max = 1000) String description,
		@NotBlank @Pattern(regexp = "(?i)automatic|draft|manual") String tier, boolean active) {

	CaseTier toTier() {
		return CaseTier.valueOf(tier.toUpperCase(Locale.ROOT));
	}
}
