package de.prime_ux.backend.cases;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface CaseEventRepository extends JpaRepository<CaseEvent, UUID> {

	/** The trail of one case, oldest step first — the order it is read in. */
	List<CaseEvent> findAllByMailCaseIdOrderByOccurredAtAsc(UUID caseId);

	/**
	 * What happened on one person's cases while they were not looking: somebody handed them a
	 * case, or a customer wrote again on one of theirs. Three conditions, each a decision:
	 *
	 * <ul>
	 * <li>the case is theirs <em>now</em> — one handed on to a colleague stops being their
	 * business, including its history;
	 * <li>they did not do it themselves — taking a case writes an ASSIGNED event like any other,
	 * and nobody needs telling what they just did;
	 * <li>nothing in the trash calls for attention.
	 * </ul>
	 *
	 * <p>Unlimited on purpose: the badge counts all of them and the popover shows the newest, and
	 * two queries would mean keeping one where clause in two places. What comes back is what
	 * happened on one person's own cases since they last looked — dozens after a holiday, not
	 * thousands.
	 */
	@Query(value = """
			select e.id            as "id",
			       c.id            as "caseId",
			       c.subject       as "subject",
			       e.type          as "type",
			       e.actor_name    as "actorName",
			       e.occurred_at   as "occurredAt"
			from case_events e
			join cases c on c.id = e.case_id
			where c.tenant_id = :tenantId
			  and c.assignee_user_id = :userId
			  and c.deleted_at is null
			  and e.type in ('ASSIGNED', 'FOLLOW_UP_RECEIVED')
			  and e.occurred_at > :since
			  and (e.actor_user_id is null or e.actor_user_id <> :userId)
			order by e.occurred_at desc""", nativeQuery = true)
	List<UnseenEvent> unseenFor(UUID tenantId, UUID userId, Instant since);

	/** The shape of the rows above; Spring Data fills it by property name. */
	interface UnseenEvent {

		UUID getId();

		UUID getCaseId();

		String getSubject();

		String getType();

		String getActorName();

		Instant getOccurredAt();
	}
}
