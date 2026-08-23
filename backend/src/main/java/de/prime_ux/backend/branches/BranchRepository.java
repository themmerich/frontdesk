package de.prime_ux.backend.branches;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface BranchRepository extends JpaRepository<Branch, UUID> {

	/** The headquarters first, then the branches alphabetically — the dropdown order. */
	List<Branch> findAllByTenantIdOrderByHeadquartersDescNameAsc(UUID tenantId);

	Optional<Branch> findByIdAndTenantId(UUID id, UUID tenantId);

	Optional<Branch> findByTenantIdAndHeadquartersTrue(UUID tenantId);

	boolean existsByTenantIdAndNameIgnoreCase(UUID tenantId, String name);
}
