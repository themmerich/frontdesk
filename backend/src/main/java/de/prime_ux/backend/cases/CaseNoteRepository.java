package de.prime_ux.backend.cases;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface CaseNoteRepository extends JpaRepository<CaseNote, UUID> {

	/** A case's notes, oldest first: a conversation between colleagues reads forwards. */
	List<CaseNote> findAllByMailCaseIdOrderByCreatedAtAsc(UUID caseId);

	/** One note of one case; a note id that belongs elsewhere simply does not match. */
	Optional<CaseNote> findByIdAndMailCaseId(UUID id, UUID caseId);

	/**
	 * How many notes each of a tenant's cases holds, in one query: the list shows an icon where
	 * there are any, and counting per row would be one query per row on every reload.
	 */
	@Query("SELECT n.mailCase.id AS caseId, COUNT(n) AS noteCount FROM CaseNote n "
			+ "WHERE n.mailCase.tenant.id = :tenantId GROUP BY n.mailCase.id")
	List<NoteCountPerCase> countPerCase(UUID tenantId);

	/** The shape of the grouped count above; Spring Data fills it by property name. */
	interface NoteCountPerCase {

		UUID getCaseId();

		long getNoteCount();
	}
}
