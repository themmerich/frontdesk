package de.prime_ux.backend.cases;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * What the dashboard shows, summed on the server: the tiles, the three rolling windows, the three
 * breakdowns and the arrivals chart in all the granularities it can be switched to. One request
 * carries every series, and every bucket carries its own breakdown by category and channel, so
 * switching the stretch or narrowing the chart redraws from what is already there.
 *
 * @param windows keyed {@code today}, {@code week}, {@code month}, in that order
 * @param byCategory largest group first, the uncategorised last
 * @param byTier the ladder {@code automatic, draft, manual, info, ignore} and then null, gaps at
 *        zero
 * @param byChannel the four channels {@code mail, phone, fax, other}, gaps at zero
 * @param hours the 24 hours of the day now falls in, midnight to midnight
 * @param days exactly thirty days, oldest first, ending today
 * @param months exactly twelve months, oldest first, ending this one
 */
public record CaseStatisticsResponse(Totals totals, Map<String, Window> windows, List<CategoryCount> byCategory,
		List<TierCount> byTier, List<ChannelCount> byChannel, List<Bucket> hours, List<Bucket> days,
		List<Bucket> months) {

	/**
	 * What the inbox holds, what of it is still on someone's list, and where the rest went.
	 * Everything but {@code trashed} is counted without the trash: a mail somebody threw away is
	 * not work that is left.
	 *
	 * @param manual the cases a person has to deal with: manual and draft together
	 */
	public record Totals(long all, long untriaged, long manual, long archived, long trashed) {
	}

	/**
	 * @param previous what arrived in the equally long stretch right before this one
	 */
	public record Window(long count, long previous) {
	}

	/** {@code id}, {@code name} and {@code color} are null for what the triage has not seen yet. */
	public record CategoryCount(UUID id, String name, String color, long count) {
	}

	/** {@code tier} is null for what the triage has not seen yet; it travels lowercase. */
	public record TierCount(String tier, long count) {
	}

	/** How a case reached the house, and how many did. {@code channel} travels lowercase. */
	public record ChannelCount(String channel, long count) {
	}

	/**
	 * One stretch of the calendar and what arrived in it.
	 *
	 * @param period ISO text: {@code 2026-09-15T14}, {@code 2026-09-15} or {@code 2026-09}
	 * @param counts keyed by category id, {@code none} for the uncategorised, and within that by
	 *        channel; only the combinations that caught something in this bucket. Two levels
	 *        rather than two maps, so the chart can be narrowed to a category, to a channel or to
	 *        both and still read the right number.
	 */
	public record Bucket(String period, long count, Map<String, Map<String, Long>> counts) {
	}
}
