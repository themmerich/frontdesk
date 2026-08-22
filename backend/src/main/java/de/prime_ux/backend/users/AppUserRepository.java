package de.prime_ux.backend.users;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AppUserRepository extends JpaRepository<AppUser, UUID> {

	// The tenant comes along eagerly: every caller needs its name right away,
	// and outside a transaction the lazy proxy could not be resolved anymore.
	@EntityGraph(attributePaths = "tenant")
	Optional<AppUser> findByEmailIgnoreCase(String email);

	List<AppUser> findAllByTenantIdOrderByDisplayNameAsc(UUID tenantId);
}
