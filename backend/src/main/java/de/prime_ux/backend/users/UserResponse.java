package de.prime_ux.backend.users;

import java.time.Instant;
import java.util.Locale;
import java.util.UUID;

public record UserResponse(UUID id, String email, String displayName, String role, boolean active,
		Instant createdAt) {

	public static UserResponse from(AppUser user) {
		return new UserResponse(user.getId(), user.getEmail(), user.getDisplayName(),
				user.getRole().name().toLowerCase(Locale.ROOT), user.isActive(), user.getCreatedAt());
	}
}
