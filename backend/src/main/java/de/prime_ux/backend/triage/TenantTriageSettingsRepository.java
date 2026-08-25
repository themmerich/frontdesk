package de.prime_ux.backend.triage;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TenantTriageSettingsRepository extends JpaRepository<TenantTriageSettings, UUID> {

	Optional<TenantTriageSettings> findByTenantId(UUID tenantId);

	boolean existsByTenantId(UUID tenantId);
}
