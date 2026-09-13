package de.prime_ux.backend.users;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AppUserRepository extends JpaRepository<AppUser, UUID> {

	// The branch comes along eagerly: the responses carry its id, which a lazy
	// proxy could not resolve anymore outside the transaction.
	@EntityGraph(attributePaths = "branch")
	List<AppUser> findAllByTenantIdOrderByLastNameAscFirstNameAsc(UUID tenantId);

	/** Usernames are unique within a tenant; creating or renaming a user checks against that. */
	boolean existsByTenantIdAndUsernameIgnoreCase(UUID tenantId, String username);

	@EntityGraph(attributePaths = "branch")
	Optional<AppUser> findByIdAndTenantId(UUID id, UUID tenantId);

	// Tenant and branch come along eagerly: the session resolves the user on
	// every request and needs the tenant right away, outside any transaction.
	@EntityGraph(attributePaths = { "tenant", "branch" })
	Optional<AppUser> findWithTenantById(UUID id);

	/** The login with a Kennung: the name is looked for in that tenant and nowhere else. */
	@EntityGraph(attributePaths = { "tenant", "branch" })
	Optional<AppUser> findByTenantIdAndUsernameIgnoreCase(UUID tenantId, String username);

	/** The login without a Kennung: only a super-user can be meant. */
	Optional<AppUser> findByTenantIsNullAndUsernameIgnoreCase(String username);

	boolean existsByRole(UserRole role);
}
