package de.prime_ux.backend.cases;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CaseRepository extends JpaRepository<Case, UUID> {

	List<Case> findAllByTenantIdOrderByReceivedAtDesc(UUID tenantId);

	boolean existsByTenantIdAndMessageId(UUID tenantId, String messageId);
}
