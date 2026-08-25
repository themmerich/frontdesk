package de.prime_ux.backend.triage;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;

/**
 * What an admin may set on the triage as a whole.
 *
 * <p>The instructions are free text and may be empty — most tenants need none. The threshold is a
 * fraction between 0 and 1: at 0 nothing is ever downgraded for uncertainty, at 1 everything is.
 */
record TriageSettingsRequest(@Size(max = 2000) String extraInstructions,
		@NotNull @DecimalMin("0.0") @DecimalMax("1.0") BigDecimal confidenceThreshold) {

	/** An absent addendum and an empty one mean the same thing: leave the prompt as it is. */
	String normalizedInstructions() {
		return extraInstructions == null ? "" : extraInstructions.trim();
	}
}
