import { Case, CaseCategoryColor, CaseTier } from './case';

/**
 * What the dashboard counts, framework-free so it can be read and tested without a browser.
 * Everything is derived from the cases the inbox already holds — the numbers on the dashboard
 * are the rows of the table, grouped.
 */

/** The ladder as the table shows it, so both read in the same order. */
export const TIER_ORDER: readonly CaseTier[] = ['automatic', 'draft', 'manual', 'info', 'ignore'];

/** How many cases carry one category; `name` is null for the ones the triage has not seen yet. */
export type CategoryCount = {
  name: string | null;
  color: CaseCategoryColor | null;
  count: number;
};

/** How many cases sit on one tier; `tier` is null for the ones still waiting for a verdict. */
export type TierCount = {
  tier: CaseTier | null;
  count: number;
};

/**
 * How many cases arrived in one stretch of time, named by when that stretch begins — an hour, a
 * day or a month, depending on what was counted. All of it in local time.
 */
export type PeriodCount = {
  start: Date;
  count: number;
};

/**
 * What arrived in a stretch of days up to now, and what arrived in the equally long stretch before
 * it. Both end at the same time of day, so a morning is compared with a morning rather than with a
 * whole day — a number that would be behind every single morning.
 */
export type WindowCount = {
  count: number;
  previous: number;
};

/**
 * Cases per category, the largest group first and the ones without a category last — they are
 * not a category but the absence of one, and would otherwise wander through the chart as the
 * triage works through them.
 */
export function countByCategory(cases: Case[]): CategoryCount[] {
  const counts = new Map<string | null, CategoryCount>();
  for (const aCase of cases) {
    const existing = counts.get(aCase.categoryName);
    if (existing) {
      existing.count++;
    } else {
      counts.set(aCase.categoryName, { name: aCase.categoryName, color: aCase.categoryColor, count: 1 });
    }
  }
  return [...counts.values()].sort((one, other) => {
    if (one.name === null || other.name === null) {
      return one.name === null ? 1 : -1;
    }
    return other.count - one.count || one.name.localeCompare(other.name);
  });
}

/**
 * Cases per tier, in the order of the ladder and with the untriaged ones behind it. Tiers nothing
 * points at are kept at zero: a gap in the ladder says as much as a bar does.
 */
export function countByTier(cases: Case[]): TierCount[] {
  const counts = new Map<CaseTier | null, number>(TIER_ORDER.map((tier) => [tier, 0]));
  counts.set(null, 0);
  for (const aCase of cases) {
    counts.set(aCase.tier, (counts.get(aCase.tier) ?? 0) + 1);
  }
  return [...TIER_ORDER, null].map((tier) => ({ tier, count: counts.get(tier) ?? 0 }));
}

/**
 * How much came in in each hour of the day `now` falls in, from midnight to midnight. The hours
 * still ahead are part of it and empty, so the shape of a day is the same one all day long.
 */
export function countByHour(cases: Case[], now: Date): PeriodCount[] {
  return count(cases, 24, (index) => {
    const hour = startOfDay(now);
    hour.setHours(index);
    return hour;
  });
}

/**
 * How much came in on each of the last `days` days, oldest first and today last. Days without a
 * single mail are part of it: a quiet Sunday is what makes a busy Monday visible.
 */
export function countByDay(cases: Case[], days: number, today: Date): PeriodCount[] {
  return count(cases, days, (index) => {
    // Counted in calendar days rather than in milliseconds: the day the clocks change is 23 or 25
    // hours long, and stepping a fixed day through it lands beside midnight.
    const day = startOfDay(today);
    day.setDate(day.getDate() - (days - 1 - index));
    return day;
  });
}

/** How much came in in each of the last `months` months, this one last and still filling up. */
export function countByMonth(cases: Case[], months: number, now: Date): PeriodCount[] {
  return count(cases, months, (index) => {
    const month = startOfMonth(now);
    month.setMonth(month.getMonth() - (months - 1 - index));
    return month;
  });
}

/**
 * What came in over the last `days` days, and what came in over the same stretch shifted back by
 * `days`. Both are equally long and end at the same time of day, so this morning is measured
 * against yesterday morning rather than against a whole yesterday it could never catch up with.
 * The stretch starts at midnight, which makes it exactly what countByDay draws; the few hours
 * between the two stretches therefore belong to neither.
 */
export function countInWindow(cases: Case[], days: number, now: Date): WindowCount {
  const start = startOfDay(now);
  start.setDate(start.getDate() - (days - 1));
  const before = new Date(start);
  before.setDate(before.getDate() - days);
  const previousEnd = new Date(now);
  previousEnd.setDate(previousEnd.getDate() - days);

  let current = 0;
  let previous = 0;
  for (const aCase of cases) {
    const received = aCase.receivedAt;
    if (received >= start && received <= now) {
      current++;
    } else if (received >= before && received <= previousEnd) {
      previous++;
    }
  }
  return { count: current, previous };
}

/**
 * The shared shape of the three: one bucket per stretch, oldest first, and every bucket kept even
 * when nothing landed in it. A case belongs to the newest bucket that begins before it.
 */
function count(cases: Case[], buckets: number, startOfBucket: (index: number) => Date): PeriodCount[] {
  const counts = Array.from({ length: buckets }, (_, index) => ({ start: startOfBucket(index), count: 0 }));
  for (const aCase of cases) {
    // From the back: the newest bucket that begins before the case is the one it belongs to, and
    // anything older than the first bucket is not part of the stretch at all.
    for (let index = counts.length - 1; index >= 0; index--) {
      if (counts[index].start <= aCase.receivedAt) {
        counts[index].count++;
        break;
      }
    }
  }
  return counts;
}

function startOfDay(date: Date): Date {
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  return day;
}

function startOfMonth(date: Date): Date {
  const month = startOfDay(date);
  month.setDate(1);
  return month;
}
