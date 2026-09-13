package de.prime_ux.backend.tenants;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TenantRepository extends JpaRepository<Tenant, UUID> {

	/** By the Kennung, as the login page and the tenant switch hand it in — lower-cased already. */
	Optional<Tenant> findBySlug(String slug);

	boolean existsBySlug(String slug);
}
