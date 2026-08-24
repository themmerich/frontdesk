package de.prime_ux.backend.users;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import java.util.Locale;
import java.util.UUID;

/**
 * What an admin may change about an existing user. The password is not among it: it belongs to
 * the user alone, who changes it on their profile page. Same wire format as
 * {@link CreateUserRequest} otherwise.
 */
record UpdateUserRequest(@NotBlank String username, @NotBlank String firstName, @NotBlank String lastName,
		@NotBlank @Pattern(regexp = "(?i)admin|user") String role, boolean active, UUID branchId) {

	UserRole toRole() {
		return UserRole.valueOf(role.toUpperCase(Locale.ROOT));
	}
}
