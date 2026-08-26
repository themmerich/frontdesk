package de.prime_ux.backend.cases;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CaseRepository extends JpaRepository<Case, UUID> {

	// The category comes along eagerly: the inbox names it, and the lazy proxy
	// could not be resolved anymore outside the transaction.
	@EntityGraph(attributePaths = "category")
	List<Case> findAllByTenantIdOrderByReceivedAtDesc(UUID tenantId);

	/**
	 * The category comes along eagerly here for the same reason as in the list: the detail names
	 * it, and outside the transaction the lazy proxy can no longer be resolved.
	 */
	@EntityGraph(attributePaths = "category")
	Optional<Case> findWithCategoryById(UUID id);

	/** The cases the triage has not looked at yet, oldest first — mail waits in the order it came. */
	List<Case> findByTenantIdAndTierIsNullOrderByReceivedAtAsc(UUID tenantId, Limit limit);

	boolean existsByTenantIdAndMessageId(UUID tenantId, String messageId);

	/**
	 * Deletes only what belongs to this tenant. Ids of another tenant's cases simply do not match,
	 * so a guessed id deletes nothing instead of leaking that it exists.
	 */
	long deleteByTenantIdAndIdIn(UUID tenantId, Collection<UUID> ids);
}
