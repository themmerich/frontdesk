package de.prime_ux.backend.aisettings;

/**
 * What the settings page may know: whether a key is stored, never the key itself. Once saved it
 * only ever leaves the server towards the provider.
 */
record AiSettingsResponse(boolean ownKey) {

	static AiSettingsResponse from(TenantAiSettings settings) {
		return new AiSettingsResponse(settings != null && settings.hasApiKey());
	}
}
