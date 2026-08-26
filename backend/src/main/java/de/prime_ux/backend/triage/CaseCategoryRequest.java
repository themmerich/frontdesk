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
 * applies, and an empty one would make the category unusable without saying so. The colour is
 * not: it changes how the inbox looks, never what the triage does.
 */
record CaseCategoryRequest(@NotBlank @Size(max = 100) String name, @NotBlank @Size(max = 1000) String description,
		@NotBlank @Pattern(regexp = "(?i)automatic|draft|manual|info|ignore") String tier,
		@Pattern(regexp = "(?i)(blue|green|amber|red|violet|teal|grey)?") String color, boolean active) {

	CaseTier toTier() {
		return CaseTier.valueOf(tier.toUpperCase(Locale.ROOT));
	}

	/**
	 * No colour is the normal case, so the field may be absent or empty; the pattern above lets
	 * both through and only rejects a name outside the palette.
	 */
	CategoryColor toColor() {
		return color == null || color.isBlank() ? null : CategoryColor.valueOf(color.toUpperCase(Locale.ROOT));
	}
}
