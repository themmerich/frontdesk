package de.prime_ux.backend.aiusage;

import static org.assertj.core.api.Assertions.assertThat;

import de.prime_ux.backend.aiusage.AiCallRepository.AiCallSummary;
import de.prime_ux.backend.aiusage.AiCallRepository.BucketTotals;
import de.prime_ux.backend.aiusage.AiPrices.ModelPrice;
import de.prime_ux.backend.aiusage.AiUsageResponse.Bucket;
import de.prime_ux.backend.aiusage.AiUsageResponse.Window;
import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** The arithmetic behind the page, with the clock in hand. */
class AiUsageReportTest {

	private static final ZoneId BERLIN = ZoneId.of("Europe/Berlin");

	/** A Tuesday at 10:00 in Berlin. */
	private static final Instant NOW = Instant.parse("2026-09-15T08:00:00Z");

	private static final AiPrices PRICES = new AiPrices(Map.of(
			"claude-sonnet-5", new ModelPrice(new BigDecimal("2.00"), new BigDecimal("10.00"))));

	private record Row(AiCallKind kind, long inputTokens, long outputTokens, BigDecimal costUsd, Instant calledAt)
			implements AiCallSummary {

		@Override
		public AiCallKind getKind() {
			return kind;
		}

		@Override
		public long getInputTokens() {
			return inputTokens;
		}

		@Override
		public long getOutputTokens() {
			return outputTokens;
		}

		@Override
		public BigDecimal getCostUsd() {
			return costUsd;
		}

		@Override
		public Instant getCalledAt() {
			return calledAt;
		}
	}

	private record Summed(String bucket, String kind, BigDecimal costUsd, long calls) implements BucketTotals {

		@Override
		public String getBucket() {
			return bucket;
		}

		@Override
		public String getKind() {
			return kind;
		}

		@Override
		public BigDecimal getCostUsd() {
			return costUsd;
		}

		@Override
		public long getCalls() {
			return calls;
		}
	}

	private static Row row(AiCallKind kind, String cost, Duration ago) {
		return new Row(kind, 1000, 100, cost == null ? null : new BigDecimal(cost), NOW.minus(ago));
	}

	private static Summed summed(String bucket, AiCallKind kind, String cost, long calls) {
		return new Summed(bucket, kind.name(), new BigDecimal(cost), calls);
	}

	private static AiUsageResponse report(List<AiCallSummary> rows) {
		return AiUsageReport.build(rows, List.of(), List.of(), NOW, BERLIN, PRICES);
	}

	@Test
	void addsEachWindowUpAgainstTheStretchBeforeIt() {
		AiUsageResponse report = report(List.of(
				row(AiCallKind.TRIAGE, "0.010000", Duration.ofHours(2)),
				row(AiCallKind.DRAFT, "0.040000", Duration.ofHours(3)),
				// Yesterday: out of "today", into its previous stretch, and in the week.
				row(AiCallKind.TRIAGE, "0.020000", Duration.ofHours(30)),
				// Ten days ago: in the month, in the week's previous stretch.
				row(AiCallKind.DRAFT, "0.080000", Duration.ofDays(10)),
				// Forty days ago: only in the month's previous stretch.
				row(AiCallKind.TRIAGE, "0.500000", Duration.ofDays(40)),
				// Seventy days ago: out of reach altogether.
				row(AiCallKind.TRIAGE, "9.000000", Duration.ofDays(70))));

		assertThat(report.windows().keySet()).containsExactly("today", "week", "month");

		Window today = report.windows().get("today");
		assertThat(today.calls()).isEqualTo(2);
		assertThat(today.inputTokens()).isEqualTo(2000);
		assertThat(today.outputTokens()).isEqualTo(200);
		assertThat(today.costUsd()).isEqualByComparingTo("0.05");
		assertThat(today.previousCostUsd()).isEqualByComparingTo("0.02");
		assertThat(today.byKind().get("triage").costUsd()).isEqualByComparingTo("0.01");
		assertThat(today.byKind().get("draft").calls()).isEqualTo(1);
		assertThat(today.byKind().get("keyTest").calls()).isZero();

		Window week = report.windows().get("week");
		assertThat(week.costUsd()).isEqualByComparingTo("0.07");
		assertThat(week.previousCostUsd()).isEqualByComparingTo("0.08");

		Window month = report.windows().get("month");
		assertThat(month.costUsd()).isEqualByComparingTo("0.15");
		assertThat(month.previousCostUsd()).isEqualByComparingTo("0.5");
	}

	@Test
	void countsCallsWithoutAPriceButAddsNothingForThem() {
		AiUsageResponse report = report(List.of(
				row(AiCallKind.TRIAGE, "0.010000", Duration.ofHours(1)),
				row(AiCallKind.TRIAGE, null, Duration.ofHours(1)),
				// Too old to be counted as unpriced within the month.
				row(AiCallKind.TRIAGE, null, Duration.ofDays(45))));

		assertThat(report.unpricedCalls()).isEqualTo(1);
		assertThat(report.windows().get("today").calls()).isEqualTo(2);
		assertThat(report.windows().get("today").costUsd()).isEqualByComparingTo("0.01");
	}

	@Test
	void givesThirtyDaysEndingTodayWithZerosWhereNothingHappened() {
		AiUsageResponse report = report(List.of(
				row(AiCallKind.TRIAGE, "0.010000", Duration.ofHours(1)),
				row(AiCallKind.DRAFT, "0.030000", Duration.ofHours(1)),
				// 23:30 Berlin the evening before, which is 21:30Z: a different day here, the
				// same day in UTC. The zone decides.
				new Row(AiCallKind.KEY_TEST, 5, 1, new BigDecimal("0.000020"), Instant.parse("2026-09-14T21:30:00Z")),
				row(AiCallKind.TRIAGE, "1.000000", Duration.ofDays(31))));

		List<Bucket> daily = report.daily();
		assertThat(daily).hasSize(30);
		assertThat(daily.getFirst().period()).isEqualTo("2026-08-17");
		assertThat(daily.getLast().period()).isEqualTo("2026-09-15");

		Bucket today = daily.getLast();
		assertThat(today.calls()).isEqualTo(2);
		assertThat(today.triageCostUsd()).isEqualByComparingTo("0.01");
		assertThat(today.draftCostUsd()).isEqualByComparingTo("0.03");
		assertThat(today.keyTestCostUsd()).isEqualByComparingTo("0");

		Bucket yesterday = daily.get(28);
		assertThat(yesterday.calls()).isEqualTo(1);
		assertThat(yesterday.keyTestCostUsd()).isEqualByComparingTo("0.00002");

		// The call from 31 days ago falls outside the series; every other day is a flat zero.
		assertThat(daily.subList(0, 28)).allSatisfy(day -> {
			assertThat(day.calls()).isZero();
			assertThat(day.triageCostUsd()).isEqualByComparingTo("0");
		});
	}

	@Test
	void givesTwelveMonthsEndingThisOneFromWhatTheDatabaseSummed() {
		AiUsageResponse report = AiUsageReport.build(List.of(), List.of(
				summed("2026-09", AiCallKind.TRIAGE, "0.400000", 40),
				summed("2026-09", AiCallKind.DRAFT, "1.200000", 15),
				summed("2026-03", AiCallKind.TRIAGE, "0.100000", 9),
				// Older than the series reaches; the database would not have handed it over,
				// and if it did, it is dropped rather than shown out of place.
				summed("2025-08", AiCallKind.TRIAGE, "5.000000", 500)), List.of(), NOW, BERLIN, PRICES);

		List<Bucket> monthly = report.monthly();
		assertThat(monthly).hasSize(12);
		assertThat(monthly.getFirst().period()).isEqualTo("2025-10");
		assertThat(monthly.getLast().period()).isEqualTo("2026-09");

		Bucket thisMonth = monthly.getLast();
		assertThat(thisMonth.calls()).isEqualTo(55);
		assertThat(thisMonth.triageCostUsd()).isEqualByComparingTo("0.4");
		assertThat(thisMonth.draftCostUsd()).isEqualByComparingTo("1.2");
		assertThat(monthly.get(5).period()).isEqualTo("2026-03");
		assertThat(monthly.get(5).calls()).isEqualTo(9);
		assertThat(monthly.get(4).calls()).isZero();
	}

	@Test
	void givesEveryYearSinceTheFirstCall() {
		AiUsageResponse report = AiUsageReport.build(List.of(), List.of(), List.of(
				summed("2024", AiCallKind.TRIAGE, "12.000000", 1200),
				summed("2026", AiCallKind.DRAFT, "3.000000", 90)), NOW, BERLIN, PRICES);

		List<Bucket> yearly = report.yearly();
		assertThat(yearly).extracting(Bucket::period).containsExactly("2024", "2025", "2026");
		assertThat(yearly.get(0).triageCostUsd()).isEqualByComparingTo("12");
		// The year in between had nothing, and still has a bar of its own.
		assertThat(yearly.get(1).calls()).isZero();
		assertThat(yearly.get(2).draftCostUsd()).isEqualByComparingTo("3");
	}

	@Test
	void listsThePriceTableAndAnswersWithZerosForNothing() {
		AiUsageResponse report = report(List.of());

		assertThat(report.prices()).hasSize(1);
		assertThat(report.prices().getFirst().model()).isEqualTo("claude-sonnet-5");
		assertThat(report.prices().getFirst().outputPerMillion()).isEqualByComparingTo("10");
		assertThat(report.windows().get("month").costUsd()).isEqualByComparingTo("0");
		assertThat(report.windows().get("month").previousCostUsd()).isEqualByComparingTo("0");
		assertThat(report.unpricedCalls()).isZero();
		assertThat(report.daily()).hasSize(30);
		assertThat(report.monthly()).hasSize(12);
		// Nothing was ever called: this year alone, empty.
		assertThat(report.yearly()).extracting(Bucket::period).containsExactly("2026");
	}

	@Test
	void reachesBackToTheStartOfTheMonthElevenMonthsAgo() {
		// September 2026 minus eleven months is October 2025; its first day starts at 00:00
		// Berlin, which is 22:00Z the evening before.
		assertThat(AiUsageReport.monthsReach(NOW, BERLIN)).isEqualTo(Instant.parse("2025-09-30T22:00:00Z"));
	}
}
