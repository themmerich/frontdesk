package de.prime_ux.backend.auth;

import de.prime_ux.backend.users.AppUser;
import java.util.Locale;

public record CurrentUserResponse(String username, String displayName, String role, String tenantName,
		boolean hasAvatar) {

	public static CurrentUserResponse from(AppUser user, boolean hasAvatar) {
		return new CurrentUserResponse(user.getUsername(), user.getDisplayName(),
				user.getRole().name().toLowerCase(Locale.ROOT), user.getTenant().getName(), hasAvatar);
	}
}
