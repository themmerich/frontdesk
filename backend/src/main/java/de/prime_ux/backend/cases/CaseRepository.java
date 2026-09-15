package de.prime_ux.backend.cases;

import de.prime_ux.backend.tenants.TenantCount;
import de.prime_ux.backend.triage.CaseTier;
import java.time.Instant;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Limit;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface CaseRepository extends JpaRepository<Case, UUID> {

	// The category comes along eagerly: the inbox names it, and the lazy proxy
	// could not be resolved anymore outside the transaction. Ordered by the last
	// move of the conversation: a customer writing again puts the case on top.
	@EntityGraph(attributePaths = "category")
	List<Case> findAllByTenantIdOrderByLastMessageAtDesc(UUID tenantId);

	/**
	 * Where a mail without threading headers might belong: the tenant's open conversations with
	 * this customer that moved after the given moment, newest first. Which of them has the same
	 * subject is decided by the caller — a subject is compared without its "Re:" and "AW:", which
	 * no query can do.
	 */
	List<Case> findAllByTenantIdAndSenderIgnoreCaseAndDeletedAtIsNullAndLastMessageAtAfterOrderByLastMessageAtDesc(
			UUID tenantId, String sender, Instant since);

	/**
	 * The category comes along eagerly here for the same reason as in the list: the detail names
	 * it, and outside the transaction the lazy proxy can no longer be resolved.
	 */
	@EntityGraph(attributePaths = "category")
	Optional<Case> findWithCategoryById(UUID id);

	/**
	 * The cases the triage has not looked at yet, oldest first — mail waits in the order it came.
	 * What somebody threw away is not looked at: the model would be asked about a mail nobody
	 * wants an answer to.
	 */
	List<Case> findByTenantIdAndTierIsNullAndDeletedAtIsNullOrderByReceivedAtAsc(UUID tenantId, Limit limit);

	/**
	 * The cases that are to get a reply written without anyone asking, and have none yet: on one of
	 * the given tiers, still in the inbox, oldest first. What was thrown away or ticked off is
	 * left alone — nobody answers those.
	 */
	List<Case> findByTenantIdAndTierInAndDraftTextIsNullAndDeletedAtIsNullAndHandledAtIsNullOrderByReceivedAtAsc(
			UUID tenantId, Collection<CaseTier> tiers, Limit limit);

	/** The cases of this tenant among the given ids; ids of another tenant's simply do not match. */
	List<Case> findAllByTenantIdAndIdIn(UUID tenantId, Collection<UUID> ids);

	boolean existsByTenantIdAndMessageId(UUID tenantId, String messageId);

	long countByCategoryId(UUID categoryId);

	/**
	 * How many cases hang off each of a tenant's categories, in one query. Counting per category
	 * would mean one query per row of a list that is read on every visit to the admin page.
	 */
	@Query("SELECT c.category.id AS categoryId, COUNT(c) AS caseCount FROM Case c "
			+ "WHERE c.tenant.id = :tenantId AND c.category IS NOT NULL GROUP BY c.category.id")
	List<CaseCountPerCategory> countPerCategory(UUID tenantId);

	/** The shape of the grouped count above; Spring Data fills it by property name. */
	interface CaseCountPerCategory {

		UUID getCategoryId();

		long getCaseCount();
	}

	/**
	 * Deletes only what belongs to this tenant. Ids of another tenant's cases simply do not match,
	 * so a guessed id deletes nothing instead of leaking that it exists.
	 */
	long deleteByTenantIdAndIdIn(UUID tenantId, Collection<UUID> ids);

	/**
	 * The five numbers the dashboard's tiles carry, in one row. Everything but the trash is
	 * counted without it: what somebody threw away is not work that is left.
	 */
	@Query(value = """
			select count(*) filter (where c.deleted_at is null)                                as "all",
			       count(*) filter (where c.deleted_at is null and c.tier is null)             as "untriaged",
			       count(*) filter (where c.deleted_at is null and c.tier in ('MANUAL', 'DRAFT')) as "manual",
			       count(*) filter (where c.deleted_at is null and c.handled_at is not null)   as "archived",
			       count(*) filter (where c.deleted_at is not null)                            as "trashed"
			from cases c
			where c.tenant_id = :tenantId""", nativeQuery = true)
	CaseTotals totals(UUID tenantId);

	/** The shape of the row above; Spring Data fills it by property name. */
	interface CaseTotals {

		long getAll();

		long getUntriaged();

		long getManual();

		long getArchived();

		long getTrashed();
	}

	/**
	 * How many cases arrived in a stretch, and how many in the equally long stretch right before
	 * it. Both bounds come from the caller, so the rule that decides where a stretch begins lives
	 * in one place and the query only counts.
	 */
	@Query(value = """
			select count(*) filter (where c.received_at >= :from and c.received_at <= :to)                 as "count",
			       count(*) filter (where c.received_at >= :previousFrom and c.received_at <= :previousTo) as "previous"
			from cases c
			where c.tenant_id = :tenantId and c.deleted_at is null""", nativeQuery = true)
	WindowCount countInWindow(UUID tenantId, Instant from, Instant to, Instant previousFrom, Instant previousTo);

	interface WindowCount {

		long getCount();

		long getPrevious();
	}

	/**
	 * Cases per category with what the chart needs to draw them, the trash left out. A case the
	 * triage has not seen yet comes back with nulls; it is not a category but the absence of one,
	 * and the report puts it last.
	 */
	@Query(value = """
			select cat.id as "id", cat.name as "name", cat.color as "color", count(*) as "count"
			from cases c
			left join case_categories cat on cat.id = c.category_id
			where c.tenant_id = :tenantId and c.deleted_at is null
			group by cat.id, cat.name, cat.color""", nativeQuery = true)
	List<CategoryCount> countByCategory(UUID tenantId);

	interface CategoryCount {

		UUID getId();

		String getName();

		String getColor();

		long getCount();
	}

	/** Cases per tier, the trash left out; a tier nothing points at simply does not come back. */
	@Query(value = """
			select c.tier as "tier", count(*) as "count"
			from cases c
			where c.tenant_id = :tenantId and c.deleted_at is null
			group by c.tier""", nativeQuery = true)
	List<TierCount> countByTier(UUID tenantId);

	interface TierCount {

		String getTier();

		long getCount();
	}

	/**
	 * Arrivals per stretch of the calendar and category, for one granularity of the chart. The
	 * zone decides where a stretch begins; the format is how it is spelled, as {@code to_char}
	 * takes it.
	 *
	 * @param unit {@code hour}, {@code day} or {@code month}
	 * @param format {@code YYYY-MM-DD"T"HH24}, {@code YYYY-MM-DD} or {@code YYYY-MM}
	 */
	@Query(value = """
			select to_char(date_trunc(:unit, c.received_at at time zone :zone), :format) as "period",
			       coalesce(c.category_id::text, 'none')                                 as "category",
			       count(*)                                                              as "count"
			from cases c
			where c.tenant_id = :tenantId and c.deleted_at is null and c.received_at >= :since
			group by 1, 2
			order by 1, 2""", nativeQuery = true)
	List<PeriodCount> countByPeriod(UUID tenantId, Instant since, String unit, String zone, String format);

	interface PeriodCount {

		String getPeriod();

		String getCategory();

		long getCount();
	}

	/**
	 * Cases per tenant for the Mandanten page, the trash included: the number says how much hangs
	 * on the tenant, which is what somebody about to delete it wants to know.
	 */
	@Query("select c.tenant.id as tenantId, count(c) as count from Case c group by c.tenant.id")
	List<TenantCount> countPerTenant();
}
