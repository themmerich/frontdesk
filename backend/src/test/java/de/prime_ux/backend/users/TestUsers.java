package de.prime_ux.backend.users;

import java.util.List;
import java.util.Optional;

/**
 * Looks users up by name for assertions. Production code resolves users by id (the session
 * principal) or within a tenant; a name alone is a test's way of pointing at a row, and the test
 * tables hold a handful of them.
 */
public final class TestUsers {

	private TestUsers() {
	}

	public static List<AppUser> findAll(AppUserRepository repository, String username) {
		return repository.findAll().stream()
				.filter(user -> user.getUsername().equalsIgnoreCase(username))
				.toList();
	}

	public static Optional<AppUser> find(AppUserRepository repository, String username) {
		List<AppUser> users = findAll(repository, username);
		return users.size() == 1 ? Optional.of(users.getFirst()) : Optional.empty();
	}
}
