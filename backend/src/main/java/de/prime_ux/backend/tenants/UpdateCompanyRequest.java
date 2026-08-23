package de.prime_ux.backend.tenants;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

public record UpdateCompanyRequest(@NotBlank String name, String website, @NotNull LogoDisplay logoDisplay,
		@Pattern(regexp = "#[0-9a-fA-F]{6}") String primaryColor) {
}
