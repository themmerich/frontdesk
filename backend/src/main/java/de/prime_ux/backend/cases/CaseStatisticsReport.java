package de.prime_ux.backend.cases;

import de.prime_ux.backend.cases.CaseRepository.CategoryCount;
import de.prime_ux.backend.cases.CaseRepository.CaseTotals;
import de.prime_ux.backend.cases.CaseRepository.ChannelCount;
import de.prime_ux.backend.cases.CaseRepository.PeriodCount;
import de.prime_ux.backend.cases.CaseRepository.TierCount;
import de.prime_ux.backend.cases.CaseStatisticsResponse.Bucket;
import de.prime_ux.backend.cases.CaseStatisticsResponse.Totals;
import de.prime_ux.backend.cases.CaseStatisticsResponse.Window;
import de.prime_ux.backend.triage.CaseTier;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.IntStream;

/**
 * Adds a tenant's cases up into what the dashboard shows. Pure: rows in, response out, the moment
 * and the zone handed in, so a test can pin the arithmetic down without a clock or a database.
 *
 * <p>Three jobs. It decides where a stretch of time begins and hands the bounds to the queries;
 * it opens every bucket of a series so a quiet day stays in it; and it orders what the charts
 * read. The counting itself happens in the database.
 */
final class CaseStatisticsReport {

	/** How many hours the arrivals chart shows for a day: all of them, ahead ones included. */
	static final int HOURS = 24;

	/** How many days the arrivals chart shows, today included. */
	static final int DAYS = 30;

	/** How many months the arrivals chart shows, this one included. */
	static final int MONTHS = 12;

	/** What the three tiles are about, in the order they stand in. */
	private static final Map<String, Integer> WINDOW_DAYS = new LinkedHashMap<>();

	static {
		WINDOW_DAYS.put("today", 1);
		WINDOW_DAYS.put("week", 7);
		WINDOW_DAYS.put("month", 30);
	}

	private CaseStatisticsReport() {
	}

	/**
	 * A window and the equally long stretch right before it. Both start at a midnight and end at
	 * the same time of day, so this morning is measured against yesterday morning rather than
	 * against a whole yesterday it could never catch up with.
	 */
	record Bounds(Instant from, Instant to, Instant previousFrom, Instant previousTo) {
	}

	/** The bounds for one of the three windows; the key is {@code today}, {@code week}, {@code month}. */
	static Bounds boundsFor(String window, Instant now, ZoneId zone) {
		int days = WINDOW_DAYS.get(window);
		Instant from = startOfDay(now, zone).minus(Duration.ofDays(days - 1L));
		Duration shift = Duration.ofDays(days);
		return new Bounds(from, now, from.minus(shift), now.minus(shift));
	}

	/** The windows in the order they are shown, so a caller asks for each in turn. */
	static List<String> windows() {
		return List.copyOf(WINDOW_DAYS.keySet());
	}

	/** The first moment each series is about, so the query reads no further back than it must. */
	static Instant hoursReach(Instant now, ZoneId zone) {
		return startOfDay(now, zone);
	}

	static Instant daysReach(Instant now, ZoneId zone) {
		return startOfDay(now, zone).minus(Duration.ofDays(DAYS - 1L));
	}

	static Instant monthsReach(Instant now, ZoneId zone) {
		return YearMonth.from(now.atZone(zone)).minusMonths(MONTHS - 1L).atDay(1).atStartOfDay(zone).toInstant();
	}

	/**
	 * @param windows the counted windows, keyed as {@link #windows()} names them
	 * @param hours the hour buckets as the database grouped them, {@code YYYY-MM-DD"T"HH24}
	 * @param days the day buckets, {@code YYYY-MM-DD}
	 * @param months the month buckets, {@code YYYY-MM}
	 */
	static CaseStatisticsResponse build(CaseTotals totals, Map<String, CaseRepository.WindowCount> windows,
			List<CategoryCount> byCategory, List<TierCount> byTier, List<ChannelCount> byChannel,
			List<PeriodCount> hours, List<PeriodCount> days, List<PeriodCount> months, Instant now, ZoneId zone) {
		Map<String, Window> countedWindows = new LinkedHashMap<>();
		windows.forEach((name, counted) -> countedWindows.put(name, new Window(counted.getCount(),
				counted.getPrevious())));

		return new CaseStatisticsResponse(totals(totals), countedWindows, categories(byCategory), tiers(byTier),
				channels(byChannel), series(hours, hourPeriods(now, zone)), series(days, dayPeriods(now, zone)),
				series(months, monthPeriods(now, zone)));
	}

	private static Totals totals(CaseTotals totals) {
		return new Totals(totals.getAll(), totals.getUntriaged(), totals.getManual(), totals.getArchived(),
				totals.getTrashed());
	}

	/**
	 * The largest group first and the ones without a category last — they are not a category but
	 * the absence of one, and would otherwise wander through the chart as the triage works
	 * through them.
	 */
	private static List<CaseStatisticsResponse.CategoryCount> categories(List<CategoryCount> rows) {
		return rows.stream()
				.sorted(Comparator.<CategoryCount, Boolean>comparing(row -> row.getName() == null)
						.thenComparing(Comparator.comparingLong(CategoryCount::getCount).reversed())
						.thenComparing(row -> row.getName() == null ? "" : row.getName()))
				.map(row -> new CaseStatisticsResponse.CategoryCount(row.getId(), row.getName(),
						lowercase(row.getColor()), row.getCount()))
				.toList();
	}

	/**
	 * The ladder in its own order with the untriaged behind it. Tiers nothing points at are kept
	 * at zero: a gap in the ladder says as much as a bar does.
	 */
	private static List<CaseStatisticsResponse.TierCount> tiers(List<TierCount> rows) {
		Map<String, Long> counted = new LinkedHashMap<>();
		rows.forEach(row -> counted.put(lowercase(row.getTier()), row.getCount()));
		List<CaseStatisticsResponse.TierCount> ladder = new ArrayList<>();
		for (CaseTier tier : CaseTier.values()) {
			String name = lowercase(tier.name());
			ladder.add(new CaseStatisticsResponse.TierCount(name, counted.getOrDefault(name, 0L)));
		}
		ladder.add(new CaseStatisticsResponse.TierCount(null, counted.getOrDefault(null, 0L)));
		return ladder;
	}

	/**
	 * The four channels in the order the enum names them, gaps at zero. Every case came in over
	 * one of them, so unlike the tiers there is no row for the absence of an answer.
	 */
	private static List<CaseStatisticsResponse.ChannelCount> channels(List<ChannelCount> rows) {
		Map<String, Long> counted = new LinkedHashMap<>();
		rows.forEach(row -> counted.put(lowercase(row.getChannel()), row.getCount()));
		return Arrays.stream(CaseChannel.values())
				.map(channel -> lowercase(channel.name()))
				.map(name -> new CaseStatisticsResponse.ChannelCount(name, counted.getOrDefault(name, 0L)))
				.toList();
	}

	/**
	 * Every bucket of a series, in order and at zero, then what the database found filled in. A
	 * row names a category and a channel, and is counted under both at once: the chart is narrowed
	 * by either or by both, and a bucket that kept the two apart could not answer the third case.
	 */
	private static List<Bucket> series(List<PeriodCount> rows, List<String> periods) {
		Map<String, Map<String, Map<String, Long>>> byPeriod = new LinkedHashMap<>();
		periods.forEach(period -> byPeriod.put(period, new LinkedHashMap<>()));
		for (PeriodCount row : rows) {
			Map<String, Map<String, Long>> categories = byPeriod.get(row.getPeriod());
			// A row outside every opened bucket is not part of the stretch and is dropped.
			if (categories != null) {
				categories.computeIfAbsent(row.getCategory(), category -> new LinkedHashMap<>())
						.merge(lowercase(row.getChannel()), row.getCount(), Long::sum);
			}
		}
		return byPeriod.entrySet().stream()
				.map(entry -> new Bucket(entry.getKey(), total(entry.getValue()), entry.getValue()))
				.toList();
	}

	/** What a bucket holds all told, whichever category and channel it came in under. */
	private static long total(Map<String, Map<String, Long>> counts) {
		return counts.values().stream()
				.flatMap(byChannel -> byChannel.values().stream())
				.mapToLong(Long::longValue)
				.sum();
	}

	/**
	 * The hours of the day now falls in, midnight to midnight. The ones still ahead are part of it
	 * and empty, so the shape of a day is the same one all day long.
	 */
	private static List<String> hourPeriods(Instant now, ZoneId zone) {
		LocalDate today = now.atZone(zone).toLocalDate();
		return IntStream.range(0, HOURS)
				.mapToObj(hour -> String.format(Locale.ROOT, "%sT%02d", today, hour))
				.toList();
	}

	/**
	 * The last {@link #DAYS} days, oldest first and today last. Counted in calendar days rather
	 * than in milliseconds: the day the clocks change is 23 or 25 hours long, and stepping a fixed
	 * day through it lands beside midnight.
	 */
	private static List<String> dayPeriods(Instant now, ZoneId zone) {
		LocalDate today = now.atZone(zone).toLocalDate();
		List<String> periods = new ArrayList<>();
		for (LocalDate day = today.minusDays(DAYS - 1L); !day.isAfter(today); day = day.plusDays(1)) {
			periods.add(day.toString());
		}
		return periods;
	}

	/** The last {@link #MONTHS} months, this one last and still filling up. */
	private static List<String> monthPeriods(Instant now, ZoneId zone) {
		YearMonth thisMonth = YearMonth.from(now.atZone(zone));
		List<String> periods = new ArrayList<>();
		for (YearMonth month = thisMonth.minusMonths(MONTHS - 1L); !month.isAfter(thisMonth); month = month
				.plusMonths(1)) {
			periods.add(month.toString());
		}
		return periods;
	}

	private static Instant startOfDay(Instant now, ZoneId zone) {
		return now.atZone(zone).toLocalDate().atStartOfDay(zone).toInstant();
	}

	/** Enums travel lowercase on the wire, as they do everywhere else in this package. */
	private static String lowercase(String value) {
		return value == null ? null : value.toLowerCase(Locale.ROOT);
	}
}
