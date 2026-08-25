package de.prime_ux.backend.triage;

import java.math.BigDecimal;

/** The triage knobs of a tenant, as the admin page shows and stores them. */
record TriageSettingsResponse(String extraInstructions, BigDecimal confidenceThreshold) {

	static TriageSettingsResponse from(TenantTriageSettings settings) {
		return new TriageSettingsResponse(settings.getExtraInstructions(), settings.getConfidenceThreshold());
	}
}
