package de.prime_ux.backend.users;

import java.time.Instant;
import java.util.Locale;
import java.util.UUID;

public record UserResponse(UUID id, String username, String firstName, String lastName, String role,
		boolean active, UUID branchId, Instant createdAt) {

	public static UserResponse from(AppUser user) {
		return new UserResponse(user.getId(), user.getUsername(), user.getFirstName(), user.getLastName(),
				user.getRole().name().toLowerCase(Locale.ROOT), user.isActive(),
				user.getBranch() == null ? null : user.getBranch().getId(), user.getCreatedAt());
	}
}
