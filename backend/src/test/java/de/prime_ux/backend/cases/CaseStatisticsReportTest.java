package de.prime_ux.backend.cases;

import static org.assertj.core.api.Assertions.assertThat;

import de.prime_ux.backend.cases.CaseRepository.CaseTotals;
import de.prime_ux.backend.cases.CaseRepository.CategoryCount;
import de.prime_ux.backend.cases.CaseRepository.PeriodCount;
import de.prime_ux.backend.cases.CaseRepository.TierCount;
import de.prime_ux.backend.cases.CaseRepository.WindowCount;
import de.prime_ux.backend.cases.CaseStatisticsReport.Bounds;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;

/**
 * The arithmetic of the dashboard, pinned to a moment and a zone. No clock and no database: what
 * the report decides is decided here, and what the database counts is handed in as rows.
 */
class CaseStatisticsReportTest {

	private static final ZoneId BERLIN = ZoneId.of("Europe/Berlin");

	/** A Tuesday afternoon, far enough into the day that "today" is not yet a whole one. */
	private static final Instant NOW = ZonedDateTime.of(2026, 9, 15, 14, 30, 0, 0, BERLIN).toInstant();

	@Test
	void measuresTodayAgainstYesterdayUpToTheSameHour() {
		Bounds today = CaseStatisticsReport.boundsFor("today", NOW, BERLIN);

		assertThat(today.from()).isEqualTo(berlin(2026, 9, 15, 0, 0));
		assertThat(today.to()).isEqualTo(NOW);
		assertThat(today.previousFrom()).isEqualTo(berlin(2026, 9, 14, 0, 0));
		// Not the whole of yesterday: a morning measured against a whole day could never catch up.
		assertThat(today.previousTo()).isEqualTo(berlin(2026, 9, 14, 14, 30));
	}

	@Test
	void startsTheLongerWindowsAtAMidnightAndShiftsThemByTheirOwnLength() {
		Bounds week = CaseStatisticsReport.boundsFor("week", NOW, BERLIN);
		Bounds month = CaseStatisticsReport.boundsFor("month", NOW, BERLIN);

		// Seven days ending now, the first of them beginning at midnight.
		assertThat(week.from()).isEqualTo(berlin(2026, 9, 9, 0, 0));
		assertThat(week.previousFrom()).isEqualTo(berlin(2026, 9, 2, 0, 0));
		assertThat(week.previousTo()).isEqualTo(berlin(2026, 9, 8, 14, 30));
		assertThat(month.from()).isEqualTo(berlin(2026, 8, 17, 0, 0));
		assertThat(month.previousFrom()).isEqualTo(berlin(2026, 7, 18, 0, 0));
		assertThat(month.previousTo()).isEqualTo(berlin(2026, 8, 16, 14, 30));
	}

	@Test
	void namesTheWindowsInTheOrderTheyAreShown() {
		assertThat(CaseStatisticsReport.windows()).containsExactly("today", "week", "month");
	}

	@Test
	void readsNoFurtherBackThanEachSeriesNeeds() {
		assertThat(CaseStatisticsReport.hoursReach(NOW, BERLIN)).isEqualTo(berlin(2026, 9, 15, 0, 0));
		assertThat(CaseStatisticsReport.daysReach(NOW, BERLIN)).isEqualTo(berlin(2026, 8, 17, 0, 0));
		// Twelve months back means the first of that month, not the same day of it.
		assertThat(CaseStatisticsReport.monthsReach(NOW, BERLIN)).isEqualTo(berlin(2025, 10, 1, 0, 0));
	}

	@Test
	void keepsEveryBucketOfEverySeriesEvenWhereNothingLanded() {
		CaseStatisticsResponse response = build(List.of(), List.of(), List.of(row("2026-09-15T09", "none", 3)),
				List.of(row("2026-09-15", "none", 3)), List.of(row("2026-09", "none", 3)));

		assertThat(response.hours()).hasSize(24);
		assertThat(response.days()).hasSize(30);
		assertThat(response.months()).hasSize(12);
		// Oldest first, today and this month last; the hours run midnight to midnight.
		assertThat(response.hours().getFirst().period()).isEqualTo("2026-09-15T00");
		assertThat(response.hours().getLast().period()).isEqualTo("2026-09-15T23");
		assertThat(response.days().getFirst().period()).isEqualTo("2026-08-17");
		assertThat(response.days().getLast().period()).isEqualTo("2026-09-15");
		assertThat(response.months().getFirst().period()).isEqualTo("2025-10");
		assertThat(response.months().getLast().period()).isEqualTo("2026-09");
		// A quiet Sunday is what makes a busy Monday visible.
		assertThat(response.days()).filteredOn(bucket -> bucket.count() == 0).hasSize(29);
	}

	@Test
	void countsABucketAsTheSumOfItsCategoriesAndKeepsThemApart() {
		UUID lieferung = UUID.randomUUID();
		UUID rechnung = UUID.randomUUID();
		CaseStatisticsResponse response = build(List.of(), List.of(), List.of(),
				List.of(row("2026-09-15", lieferung.toString(), 4), row("2026-09-15", rechnung.toString(), 2),
						row("2026-09-15", "none", 1), row("2026-09-14", lieferung.toString(), 5)),
				List.of());

		CaseStatisticsResponse.Bucket today = response.days().getLast();
		assertThat(today.period()).isEqualTo("2026-09-15");
		assertThat(today.count()).isEqualTo(7);
		assertThat(today.byCategory()).containsOnly(Map.entry(lieferung.toString(), 4L),
				Map.entry(rechnung.toString(), 2L), Map.entry("none", 1L));
		assertThat(response.days().get(response.days().size() - 2).count()).isEqualTo(5);
	}

	@Test
	void dropsARowThatFallsOutsideEveryBucketItCouldBelongTo() {
		// A day before the stretch begins: counted by the database, not part of the series.
		CaseStatisticsResponse response = build(List.of(), List.of(), List.of(),
				List.of(row("2026-08-16", "none", 9), row("2026-09-15", "none", 1)), List.of());

		assertThat(response.days()).hasSize(30);
		assertThat(response.days().stream().mapToLong(CaseStatisticsResponse.Bucket::count).sum()).isEqualTo(1);
	}

	@Test
	void stepsThroughTheDayTheClocksChangeInCalendarDays() {
		// The last Sunday in October is 25 hours long; a fixed day stepped through it lands beside
		// midnight and would name the same date twice.
		Instant afterTheChange = ZonedDateTime.of(2026, 10, 27, 9, 0, 0, 0, BERLIN).toInstant();
		CaseStatisticsResponse response = build(List.of(), List.of(), List.of(), List.of(), List.of(),
				afterTheChange);

		assertThat(response.days()).hasSize(30);
		assertThat(response.days().stream().map(CaseStatisticsResponse.Bucket::period).distinct()).hasSize(30);
		assertThat(response.days().getLast().period()).isEqualTo("2026-10-27");
		assertThat(response.days().get(response.days().size() - 3).period()).isEqualTo("2026-10-25");
	}

	@Test
	void putsTheBiggestCategoryFirstAndTheOnesWithoutOneLast() {
		UUID lieferung = UUID.randomUUID();
		UUID angebot = UUID.randomUUID();
		UUID rechnung = UUID.randomUUID();
		CaseStatisticsResponse response = build(
				List.of(category(null, null, null, 7), category(lieferung, "Lieferung", "BLUE", 4),
						category(angebot, "Angebot", "GREEN", 9), category(rechnung, "Rechnung", "AMBER", 4)),
				List.of(), List.of(), List.of(), List.of());

		assertThat(response.byCategory()).extracting(CaseStatisticsResponse.CategoryCount::name)
				// Nine, then the two fours by name, then the absence of a category however large.
				.containsExactly("Angebot", "Lieferung", "Rechnung", null);
		assertThat(response.byCategory().getFirst().color()).isEqualTo("green");
		assertThat(response.byCategory().getLast().count()).isEqualTo(7);
	}

	@Test
	void keepsTheTierLadderWholeWithTheUntriagedBehindIt() {
		CaseStatisticsResponse response = build(List.of(),
				List.of(tier("MANUAL", 3), tier(null, 5), tier("IGNORE", 1)), List.of(), List.of(), List.of());

		assertThat(response.byTier()).extracting(CaseStatisticsResponse.TierCount::tier)
				.containsExactly("automatic", "draft", "manual", "info", "ignore", null);
		assertThat(response.byTier()).extracting(CaseStatisticsResponse.TierCount::count)
				// A gap in the ladder says as much as a bar does.
				.containsExactly(0L, 0L, 3L, 0L, 1L, 5L);
	}

	@Test
	void carriesTheTilesAndTheWindowsThroughAsTheyWereCounted() {
		CaseStatisticsResponse response = build(List.of(), List.of(), List.of(), List.of(), List.of());

		assertThat(response.totals()).isEqualTo(new CaseStatisticsResponse.Totals(42, 7, 5, 30, 3));
		assertThat(response.windows()).containsOnlyKeys("today", "week", "month");
		assertThat(response.windows().get("today")).isEqualTo(new CaseStatisticsResponse.Window(2, 1));
	}

	private CaseStatisticsResponse build(List<CategoryCount> categories, List<TierCount> tiers, List<PeriodCount> hours,
			List<PeriodCount> days, List<PeriodCount> months) {
		return build(categories, tiers, hours, days, months, NOW);
	}

	private CaseStatisticsResponse build(List<CategoryCount> categories, List<TierCount> tiers, List<PeriodCount> hours,
			List<PeriodCount> days, List<PeriodCount> months, Instant now) {
		Map<String, WindowCount> windows = new LinkedHashMap<>();
		windows.put("today", window(2, 1));
		windows.put("week", window(11, 9));
		windows.put("month", window(40, 38));
		return CaseStatisticsReport.build(totals(42, 7, 5, 30, 3), windows, categories, tiers, hours, days, months,
				now, BERLIN);
	}

	private static Instant berlin(int year, int month, int day, int hour, int minute) {
		return ZonedDateTime.of(year, month, day, hour, minute, 0, 0, BERLIN).toInstant();
	}

	private static CaseTotals totals(long all, long untriaged, long manual, long archived, long trashed) {
		return new CaseTotals() {

			@Override
			public long getAll() {
				return all;
			}

			@Override
			public long getUntriaged() {
				return untriaged;
			}

			@Override
			public long getManual() {
				return manual;
			}

			@Override
			public long getArchived() {
				return archived;
			}

			@Override
			public long getTrashed() {
				return trashed;
			}
		};
	}

	private static WindowCount window(long count, long previous) {
		return new WindowCount() {

			@Override
			public long getCount() {
				return count;
			}

			@Override
			public long getPrevious() {
				return previous;
			}
		};
	}

	private static CategoryCount category(UUID id, String name, String color, long count) {
		return new CategoryCount() {

			@Override
			public UUID getId() {
				return id;
			}

			@Override
			public String getName() {
				return name;
			}

			@Override
			public String getColor() {
				return color;
			}

			@Override
			public long getCount() {
				return count;
			}
		};
	}

	private static TierCount tier(String tier, long count) {
		return new TierCount() {

			@Override
			public String getTier() {
				return tier;
			}

			@Override
			public long getCount() {
				return count;
			}
		};
	}

	private static PeriodCount row(String period, String category, long count) {
		return new PeriodCount() {

			@Override
			public String getPeriod() {
				return period;
			}

			@Override
			public String getCategory() {
				return category;
			}

			@Override
			public long getCount() {
				return count;
			}
		};
	}
}
