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

/** How many cases arrived on one day, counted from midnight to midnight in local time. */
export type DayCount = {
  day: Date;
  count: number;
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
 * How much came in on each of the last `days` days, oldest first and today last. Days without a
 * single mail are part of it: a quiet Sunday is what makes a busy Monday visible.
 */
export function countByDay(cases: Case[], days: number, today: Date): DayCount[] {
  const counts = new Map<number, number>();
  for (let ago = days - 1; ago >= 0; ago--) {
    // Counted back in calendar days rather than in milliseconds: the day the clocks change is
    // 23 or 25 hours long, and subtracting a fixed day from it lands beside midnight.
    const day = startOfDay(today);
    day.setDate(day.getDate() - ago);
    counts.set(day.getTime(), 0);
  }
  for (const aCase of cases) {
    const day = startOfDay(aCase.receivedAt).getTime();
    if (counts.has(day)) {
      counts.set(day, (counts.get(day) ?? 0) + 1);
    }
  }
  return [...counts.entries()].map(([day, count]) => ({ day: new Date(day), count }));
}

function startOfDay(date: Date): Date {
  const day = new Date(date);
  day.setHours(0, 0, 0, 0);
  return day;
}
