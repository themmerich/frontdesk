package de.prime_ux.backend.tenants;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;

public record UpdateCompanyRequest(@NotBlank String name, String street, String postalCode, String city,
		String country, String phone, String fax, @Email String email, String website,
		@NotNull LogoDisplay logoDisplay, @Pattern(regexp = "#[0-9a-fA-F]{6}") String primaryColor) {
}
