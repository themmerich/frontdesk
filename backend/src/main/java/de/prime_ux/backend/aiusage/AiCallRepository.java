package de.prime_ux.backend.aiusage;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface AiCallRepository extends JpaRepository<AiCall, UUID> {

	/** What the sums are made of; the tenant and the case stay behind. */
	interface AiCallSummary {

		AiCallKind getKind();

		long getInputTokens();

		long getOutputTokens();

		BigDecimal getCostUsd();

		Instant getCalledAt();
	}

	/** The calls of one stretch of the calendar, added up by what they were for. */
	interface BucketTotals {

		/** The stretch, spelled the way the query was asked to: {@code 2026-09} for a month, {@code 2026} for a year. */
		String getBucket();

		String getKind();

		BigDecimal getCostUsd();

		long getCalls();
	}

	/**
	 * A tenant's calls since a moment, oldest first. The page reads two months of them and adds
	 * them up itself: two rows per case, so even a busy mailbox is a few thousand light rows, and
	 * one reading keeps every number on the page consistent with every other.
	 */
	List<AiCallSummary> findAllByTenantIdAndCalledAtGreaterThanEqualOrderByCalledAt(UUID tenantId, Instant since);

	/**
	 * The calls since a moment, added up per calendar stretch and kind by the database — months
	 * and years reach further back than the page would want to read row by row. Stretches
	 * without a call are simply absent; the report fills them in.
	 *
	 * @param unit what {@code date_trunc} takes: {@code month} or {@code year}
	 * @param zone the zone that decides where a stretch begins, e.g. {@code Europe/Berlin}
	 * @param format how the stretch is spelled, as {@code to_char} takes it: {@code YYYY-MM} or {@code YYYY}
	 */
	@Query(value = """
			select to_char(date_trunc(:unit, c.called_at at time zone :zone), :format) as "bucket",
			       c.kind as "kind",
			       coalesce(sum(c.cost_usd), 0) as "costUsd",
			       count(*) as "calls"
			from ai_calls c
			where c.tenant_id = :tenantId and c.called_at >= :since
			group by 1, 2
			order by 1, 2""", nativeQuery = true)
	List<BucketTotals> sumByBucket(UUID tenantId, Instant since, String unit, String zone, String format);
}
