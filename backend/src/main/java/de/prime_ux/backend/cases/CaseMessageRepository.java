package de.prime_ux.backend.cases;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface CaseMessageRepository extends JpaRepository<CaseMessage, UUID> {

	/** The conversation of one case, in the order it went. */
	List<CaseMessage> findAllByMailCaseIdOrderByPositionAsc(UUID caseId);

	int countByMailCaseId(UUID caseId);

	/**
	 * Whether a mail with this Message-ID is already part of one of the tenant's conversations,
	 * in either direction — which is how a mail seen twice is told from a new one.
	 */
	boolean existsByMailCaseTenantIdAndMessageId(UUID tenantId, String messageId);

	/**
	 * The message a reply refers to, by any of the ids the reply names in In-Reply-To and
	 * References; the newest where several match. Its case is the conversation the reply belongs
	 * to.
	 */
	Optional<CaseMessage> findFirstByMailCaseTenantIdAndMessageIdInOrderByOccurredAtDesc(UUID tenantId,
			Collection<String> messageIds);

	/**
	 * How many messages each of a tenant's cases holds, in one query: the list shows the number,
	 * and counting per row would be one query per row on every reload.
	 */
	@Query("SELECT m.mailCase.id AS caseId, COUNT(m) AS messageCount FROM CaseMessage m "
			+ "WHERE m.mailCase.tenant.id = :tenantId GROUP BY m.mailCase.id")
	List<MessageCountPerCase> countPerCase(UUID tenantId);

	/** The shape of the grouped count above; Spring Data fills it by property name. */
	interface MessageCountPerCase {

		UUID getCaseId();

		long getMessageCount();
	}
}
