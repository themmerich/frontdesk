package de.prime_ux.backend.cases;

import de.prime_ux.backend.triage.CaseTier;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import java.util.Locale;

/** The tier a person puts on a case, overruling what the triage decided. */
record ChangeTierRequest(@NotBlank @Pattern(regexp = "(?i)automatic|draft|manual|info|ignore") String tier) {

	CaseTier toTier() {
		return CaseTier.valueOf(tier.toUpperCase(Locale.ROOT));
	}
}
