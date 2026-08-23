package de.prime_ux.backend.tenants;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TenantLogoRepository extends JpaRepository<TenantLogo, UUID> {

	Optional<TenantLogo> findByTenantId(UUID tenantId);

	boolean existsByTenantId(UUID tenantId);

	void deleteByTenantId(UUID tenantId);
}
