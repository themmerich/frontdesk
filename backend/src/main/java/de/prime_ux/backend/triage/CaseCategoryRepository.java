package de.prime_ux.backend.triage;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CaseCategoryRepository extends JpaRepository<CaseCategory, UUID> {

	/** The categories the prompt offers the model, in the order the tenant put them in. */
	List<CaseCategory> findAllByTenantIdAndActiveTrueOrderBySortOrderAsc(UUID tenantId);

	boolean existsByTenantId(UUID tenantId);
}
