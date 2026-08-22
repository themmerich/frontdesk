package de.prime_ux.backend.mailsettings;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

public interface TenantMailSettingsRepository extends JpaRepository<TenantMailSettings, UUID> {

	// The poller needs each settings' tenant to attribute ingested cases, and it
	// runs outside a transaction, so the tenant comes along eagerly.
	@EntityGraph(attributePaths = "tenant")
	List<TenantMailSettings> findAllByPollingEnabledTrue();

	boolean existsByTenantId(UUID tenantId);
}
