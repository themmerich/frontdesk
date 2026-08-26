package de.prime_ux.backend.aisettings;

import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TenantAiSettingsRepository extends JpaRepository<TenantAiSettings, UUID> {

	Optional<TenantAiSettings> findByTenantId(UUID tenantId);
}
