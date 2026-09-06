package de.prime_ux.backend.cases;

import de.prime_ux.backend.triage.CaseTier;
import jakarta.validation.constraints.Pattern;
import java.util.Locale;
import java.util.UUID;

/**
 * What a person makes of a case: which category it belongs to and what happens with it. Both
 * travel together because they are saved together — half a correction is worse than none.
 *
 * <p>Null is a choice for either of them. A case that fits no category is better left without one
 * than pressed into the nearest, and filing a case the triage has not seen yet says what it is
 * about, not what happens with it — inventing a tier for it would be putting words in a mouth.
 */
record ChangeClassificationRequest(UUID categoryId,
		@Pattern(regexp = "(?i)automatic|draft|manual|info|ignore") String tier) {

	CaseTier toTier() {
		return tier == null ? null : CaseTier.valueOf(tier.toUpperCase(Locale.ROOT));
	}
}
