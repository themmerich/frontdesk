package de.prime_ux.backend.aiusage;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

/**
 * What the cost page shows: sums per stretch of time, three series for the chart, the price
 * table the amounts rest on, and how many calls carry no amount. Every amount is a number, never
 * null: zero where there was nothing.
 *
 * @param windows keyed {@code today}, {@code week}, {@code month}, in that order
 * @param daily exactly thirty days, oldest first, ending today
 * @param monthly exactly twelve months, oldest first, ending this month
 * @param yearly every year from the first call to this one, oldest first; this year alone when
 *        nothing was ever called
 * @param unpricedCalls calls in the last thirty days whose model had no price
 */
public record AiUsageResponse(Map<String, Window> windows, List<Bucket> daily, List<Bucket> monthly,
		List<Bucket> yearly, List<Price> prices, long unpricedCalls) {

	/**
	 * @param previousCostUsd the equally long stretch right before this one
	 * @param byKind keyed {@code triage}, {@code draft}, {@code keyTest}
	 */
	public record Window(long calls, long inputTokens, long outputTokens, BigDecimal costUsd,
			BigDecimal previousCostUsd, Map<String, KindTotals> byKind) {
	}

	public record KindTotals(long calls, long inputTokens, long outputTokens, BigDecimal costUsd) {
	}

	/**
	 * One stretch of the calendar and what the calls in it cost, by what they were for.
	 *
	 * @param period the stretch as ISO text: {@code 2026-09-13}, {@code 2026-09} or {@code 2026}
	 */
	public record Bucket(String period, BigDecimal triageCostUsd, BigDecimal draftCostUsd, BigDecimal keyTestCostUsd,
			long calls) {
	}

	public record Price(String model, BigDecimal inputPerMillion, BigDecimal outputPerMillion) {
	}
}
