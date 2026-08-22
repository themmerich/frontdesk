package de.prime_ux.backend.auth;

import de.prime_ux.backend.users.AppUser;
import java.util.Locale;

public record CurrentUserResponse(String email, String displayName, String role, String tenantName) {

	static CurrentUserResponse from(AppUser user) {
		return new CurrentUserResponse(user.getEmail(), user.getDisplayName(),
				user.getRole().name().toLowerCase(Locale.ROOT), user.getTenant().getName());
	}
}
