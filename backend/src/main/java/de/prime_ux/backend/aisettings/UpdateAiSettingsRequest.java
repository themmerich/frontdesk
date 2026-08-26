package de.prime_ux.backend.aisettings;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * A key on its way in. The shape check is deliberately loose — it catches a pasted mail address
 * or a truncated line, and leaves deciding whether the key actually works to the provider, which
 * is what the test endpoint is for. Surrounding whitespace passes: a key gets here by copy and
 * paste, and the trailing newline is not the admin's mistake.
 */
record UpdateAiSettingsRequest(
		@NotBlank @Size(max = 200) @Pattern(regexp = "\\s*sk-ant-[A-Za-z0-9_-]+\\s*") String apiKey) {
}
