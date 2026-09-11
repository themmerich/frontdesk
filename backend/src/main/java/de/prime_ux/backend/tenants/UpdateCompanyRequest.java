package de.prime_ux.backend.tenants;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.UUID;

public record UpdateCompanyRequest(@NotBlank String name, String website, @NotNull LogoDisplay logoDisplay,
		@Pattern(regexp = "#[0-9a-fA-F]{6}") String primaryColor, @Size(max = 2000) String replySignature,
		UUID signatureUserId) {

	/** An absent signature and an empty one mean the same: the drafts end with the model's text. */
	String normalizedSignature() {
		return replySignature == null ? "" : replySignature.strip();
	}
}
