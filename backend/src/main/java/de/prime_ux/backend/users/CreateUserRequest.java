package de.prime_ux.backend.users;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.Locale;
import java.util.UUID;

/**
 * A new user, as the admin's dialog fills it. The role arrives lowercase, matching the wire
 * format of {@link UserResponse}. The active flag is a primitive on purpose: a body omitting it
 * is rejected, so whether a new account can sign in is always stated, never implied.
 */
record CreateUserRequest(@NotBlank String username, @NotBlank String firstName, @NotBlank String lastName,
		@NotBlank @Size(min = 8) String password, @NotBlank @Pattern(regexp = "(?i)admin|user") String role,
		boolean active, UUID branchId) {

	UserRole toRole() {
		return UserRole.valueOf(role.toUpperCase(Locale.ROOT));
	}
}
