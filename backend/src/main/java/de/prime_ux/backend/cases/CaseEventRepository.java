package de.prime_ux.backend.cases;

import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CaseEventRepository extends JpaRepository<CaseEvent, UUID> {

	/** The trail of one case, oldest step first — the order it is read in. */
	List<CaseEvent> findAllByMailCaseIdOrderByOccurredAtAsc(UUID caseId);
}
