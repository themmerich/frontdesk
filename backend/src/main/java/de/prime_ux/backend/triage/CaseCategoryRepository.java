package de.prime_ux.backend.triage;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CaseCategoryRepository extends JpaRepository<CaseCategory, UUID> {

	/** The categories the prompt offers the model, in the order the tenant put them in. */
	List<CaseCategory> findAllByTenantIdAndActiveTrueOrderBySortOrderAsc(UUID tenantId);

	/** Everything the admin page lists, the deactivated ones among them. */
	List<CaseCategory> findAllByTenantIdOrderBySortOrderAsc(UUID tenantId);

	Optional<CaseCategory> findByIdAndTenantId(UUID id, UUID tenantId);

	boolean existsByTenantId(UUID tenantId);

	boolean existsByTenantIdAndNameIgnoreCase(UUID tenantId, String name);

	boolean existsByTenantIdAndCode(UUID tenantId, String code);

	/** Guards the last active category: without one the triage silently stops sorting. */
	long countByTenantIdAndActiveTrue(UUID tenantId);
}
