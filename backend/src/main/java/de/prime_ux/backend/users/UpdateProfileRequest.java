package de.prime_ux.backend.users;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import java.time.LocalDate;

record UpdateProfileRequest(@NotBlank String firstName, @NotBlank String lastName, LocalDate birthDate,
		LocalDate joinedAt, String company, @Email String email, String phone, String fax) {
}
