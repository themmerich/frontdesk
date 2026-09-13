package de.prime_ux.backend.aiusage;

import de.prime_ux.backend.aiusage.AiCallRepository.AiCallSummary;
import de.prime_ux.backend.aiusage.AiCallRepository.BucketTotals;
import de.prime_ux.backend.aiusage.AiUsageResponse.Bucket;
import de.prime_ux.backend.aiusage.AiUsageResponse.KindTotals;
import de.prime_ux.backend.aiusage.AiUsageResponse.Price;
import de.prime_ux.backend.aiusage.AiUsageResponse.Window;
import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.Year;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Predicate;

/**
 * Adds a tenant's calls up into what the page shows. Pure: rows in, response out, the moment and
 * the zone handed in, so a test can pin the arithmetic down without a clock or a database.
 *
 * <p>The three windows are rolling, as the dashboard's are: the last 24 hours, the last 7 × 24
 * and the last 30 × 24, each against the equally long stretch right before it, so a morning is
 * compared with a morning. The day series is decided here, in the zone handed in; the month and
 * year series come pre-summed from the database, in the same zone, and are only filled in.
 */
final class AiUsageReport {

	/** How far back the rows have to reach: the longest window and the stretch before it. */
	static final Duration REACH = Duration.ofDays(60);

	/** How many months the month series shows, this one included. */
	static final int MONTHS = 12;

	private static final Map<String, Duration> WINDOWS = new LinkedHashMap<>();

	static {
		WINDOWS.put("today", Duration.ofDays(1));
		WINDOWS.put("week", Duration.ofDays(7));
		WINDOWS.put("month", Duration.ofDays(30));
	}

	private static final BigDecimal ZERO = BigDecimal.ZERO.setScale(6);

	private AiUsageReport() {
	}

	/** The first moment the month series is about: the start of the month eleven months ago. */
	static Instant monthsReach(Instant now, ZoneId zone) {
		return YearMonth.from(now.atZone(zone)).minusMonths(MONTHS - 1).atDay(1).atStartOfDay(zone).toInstant();
	}

	/**
	 * @param rows every call of the last {@link #REACH}, for the windows and the day series
	 * @param months the calls since {@link #monthsReach} summed per month, as {@code YYYY-MM}
	 * @param years every call ever, summed per year, as {@code YYYY}
	 */
	static AiUsageResponse build(List<AiCallSummary> rows, List<BucketTotals> months, List<BucketTotals> years,
			Instant now, ZoneId zone, AiPrices prices) {
		Map<String, Window> windows = new LinkedHashMap<>();
		WINDOWS.forEach((name, length) -> windows.put(name, window(rows, now.minus(length), now, length)));

		Instant monthAgo = now.minus(WINDOWS.get("month"));
		long unpriced = rows.stream()
				.filter(row -> !row.getCalledAt().isBefore(monthAgo) && row.getCostUsd() == null)
				.count();

		List<Price> priceTable = prices.prices().entrySet().stream()
				.sorted(Map.Entry.comparingByKey())
				.map(entry -> new Price(entry.getKey(), entry.getValue().inputPerMillion(),
						entry.getValue().outputPerMillion()))
				.toList();

		return new AiUsageResponse(windows, daily(rows, now, zone), monthly(months, now, zone),
				yearly(years, now, zone), priceTable, unpriced);
	}

	private static Window window(List<AiCallSummary> rows, Instant from, Instant to, Duration length) {
		List<AiCallSummary> inWindow = between(rows, from, to);
		KindTotals all = totals(inWindow, row -> true);
		Map<String, KindTotals> byKind = new LinkedHashMap<>();
		byKind.put("triage", totals(inWindow, row -> row.getKind() == AiCallKind.TRIAGE));
		byKind.put("draft", totals(inWindow, row -> row.getKind() == AiCallKind.DRAFT));
		byKind.put("keyTest", totals(inWindow, row -> row.getKind() == AiCallKind.KEY_TEST));
		BigDecimal previous = totals(between(rows, from.minus(length), from), row -> true).costUsd();
		return new Window(all.calls(), all.inputTokens(), all.outputTokens(), all.costUsd(), previous, byKind);
	}

	/** The rows from {@code from} inclusive to {@code to} exclusive. */
	private static List<AiCallSummary> between(List<AiCallSummary> rows, Instant from, Instant to) {
		return rows.stream()
				.filter(row -> !row.getCalledAt().isBefore(from) && row.getCalledAt().isBefore(to))
				.toList();
	}

	/** Priced rows add up; a row without an amount counts as a call and adds nothing. */
	private static KindTotals totals(List<AiCallSummary> rows, Predicate<AiCallSummary> which) {
		long calls = 0;
		long input = 0;
		long output = 0;
		BigDecimal cost = ZERO;
		for (AiCallSummary row : rows) {
			if (!which.test(row)) {
				continue;
			}
			calls++;
			input += row.getInputTokens();
			output += row.getOutputTokens();
			if (row.getCostUsd() != null) {
				cost = cost.add(row.getCostUsd());
			}
		}
		return new KindTotals(calls, input, output, cost);
	}

	/** Thirty calendar days ending today, with a row for each, so the chart never has to fill gaps. */
	private static List<Bucket> daily(List<AiCallSummary> rows, Instant now, ZoneId zone) {
		LocalDate today = now.atZone(zone).toLocalDate();
		Series series = new Series();
		for (LocalDate day = today.minusDays(29); !day.isAfter(today); day = day.plusDays(1)) {
			series.open(day.toString());
		}
		for (AiCallSummary row : rows) {
			series.add(row.getCalledAt().atZone(zone).toLocalDate().toString(), row.getKind(), row.getCostUsd(), 1);
		}
		return series.buckets();
	}

	/** Twelve months ending this one, a row for each. */
	private static List<Bucket> monthly(List<BucketTotals> months, Instant now, ZoneId zone) {
		YearMonth thisMonth = YearMonth.from(now.atZone(zone));
		Series series = new Series();
		for (YearMonth month = thisMonth.minusMonths(MONTHS - 1); !month.isAfter(thisMonth); month = month.plusMonths(1)) {
			series.open(month.toString());
		}
		months.forEach(series::add);
		return series.buckets();
	}

	/** Every year from the first call to this one; this year alone when nothing was ever called. */
	private static List<Bucket> yearly(List<BucketTotals> years, Instant now, ZoneId zone) {
		Year thisYear = Year.from(now.atZone(zone));
		Year first = years.stream()
				.map(bucket -> Year.parse(bucket.getBucket()))
				.min(Year::compareTo)
				.filter(year -> year.isBefore(thisYear))
				.orElse(thisYear);
		Series series = new Series();
		for (Year year = first; !year.isAfter(thisYear); year = year.plusYears(1)) {
			series.open(year.toString());
		}
		years.forEach(series::add);
		return series.buckets();
	}

	/** Buckets in the order they were opened; what falls outside every opened one is dropped. */
	private static final class Series {

		private final Map<String, BigDecimal[]> costs = new LinkedHashMap<>();
		private final Map<String, Long> calls = new LinkedHashMap<>();

		void open(String period) {
			costs.put(period, new BigDecimal[] { ZERO, ZERO, ZERO });
			calls.put(period, 0L);
		}

		void add(BucketTotals totals) {
			add(totals.getBucket(), AiCallKind.valueOf(totals.getKind()), totals.getCostUsd(), totals.getCalls());
		}

		void add(String period, AiCallKind kind, BigDecimal costUsd, long count) {
			BigDecimal[] perKind = costs.get(period);
			if (perKind == null) {
				return;
			}
			calls.merge(period, count, Long::sum);
			if (costUsd != null) {
				perKind[kind.ordinal()] = perKind[kind.ordinal()].add(costUsd);
			}
		}

		List<Bucket> buckets() {
			List<Bucket> buckets = new ArrayList<>();
			costs.forEach((period, perKind) -> buckets.add(new Bucket(period, perKind[AiCallKind.TRIAGE.ordinal()],
					perKind[AiCallKind.DRAFT.ordinal()], perKind[AiCallKind.KEY_TEST.ordinal()], calls.get(period))));
			return buckets;
		}
	}
}
