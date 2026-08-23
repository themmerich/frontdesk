package de.prime_ux.backend.users;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AppUserRepository extends JpaRepository<AppUser, UUID> {

	// Tenant and branch come along eagerly: every caller needs the tenant right
	// away (and the profile the branch), and outside a transaction the lazy
	// proxies could not be resolved anymore.
	@EntityGraph(attributePaths = { "tenant", "branch" })
	List<AppUser> findAllByUsernameIgnoreCase(String username);

	List<AppUser> findAllByTenantIdOrderByLastNameAscFirstNameAsc(UUID tenantId);

	Optional<AppUser> findByIdAndTenantId(UUID id, UUID tenantId);

	/**
	 * Usernames are unique per tenant only. The login (and the session principal) carries no
	 * tenant yet, so a name existing in several tenants cannot be resolved and answers empty —
	 * nobody ever signs in to the wrong tenant. Resolving that needs a tenant choice at login.
	 */
	default Optional<AppUser> findUniqueByUsernameIgnoreCase(String username) {
		List<AppUser> users = findAllByUsernameIgnoreCase(username);
		return users.size() == 1 ? Optional.of(users.getFirst()) : Optional.empty();
	}
}
