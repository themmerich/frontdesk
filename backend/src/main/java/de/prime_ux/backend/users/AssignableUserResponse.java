package de.prime_ux.backend.users;

import java.util.UUID;

/**
 * A colleague a case can be handed to: the key a picker needs and the name it shows, and nothing
 * else. Everybody who works in the inbox reads this, so it carries none of what makes a
 * {@link UserResponse} an administrative record — no username, no role, no birthday.
 */
public record AssignableUserResponse(UUID id, String name) {

	static AssignableUserResponse from(AppUser user) {
		return new AssignableUserResponse(user.getId(), user.getDisplayName());
	}
}
