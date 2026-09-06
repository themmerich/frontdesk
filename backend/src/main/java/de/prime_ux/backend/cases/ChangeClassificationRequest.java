package de.prime_ux.backend.cases;

import de.prime_ux.backend.triage.CaseTier;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import java.util.Locale;
import java.util.UUID;

/**
 * What a person makes of a case: which category it belongs to and what happens with it. Both
 * travel together because they are saved together — half a correction is worse than none.
 *
 * <p>A null category is a choice of its own: a case that fits none of them is better left without
 * one than pressed into the nearest. A tier is never null, because every case has to land
 * somewhere.
 */
record ChangeClassificationRequest(UUID categoryId,
		@NotBlank @Pattern(regexp = "(?i)automatic|draft|manual|info|ignore") String tier) {

	CaseTier toTier() {
		return CaseTier.valueOf(tier.toUpperCase(Locale.ROOT));
	}
}
