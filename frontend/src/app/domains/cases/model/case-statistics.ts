import { CaseCategoryColor, CaseChannel, CaseTier } from './case';

/**
 * What the dashboard shows, as the server summed it. Nothing here is counted in the browser: the
 * page draws what the endpoint hands it, and the cases themselves never travel for this.
 *
 * <p>One request carries every series, and every bucket carries its own breakdown by category and
 * channel, so switching the stretch or narrowing the chart redraws from what is already there.
 */
export type CaseStatistics = {
  totals: CaseTotals;
  windows: Record<WindowName, ArrivalWindow>;
  byCategory: CategoryCount[];
  byTier: TierCount[];
  /** All four channels, in the order the model names them, the ones nothing came in over at zero. */
  byChannel: ChannelCount[];
  /** The 24 hours of today, midnight to midnight; the ones still ahead are there and empty. */
  hours: ArrivalBucket[];
  /** Exactly thirty days, oldest first, ending today. The last seven of them are the week. */
  days: ArrivalBucket[];
  /** Exactly twelve months, oldest first, ending this one. */
  months: ArrivalBucket[];
};

/** The three stretches the tiles compare with the stretch before them. */
export type WindowName = 'today' | 'week' | 'month';

/**
 * What the inbox holds, what of it is still on someone's list, and where the rest went. Only
 * `trashed` is about the trash; everything else is counted without it.
 */
export type CaseTotals = {
  all: number;
  untriaged: number;
  /** What a person has to deal with: manual and draft together. */
  manual: number;
  archived: number;
  trashed: number;
};

/** What arrived in a stretch, and what arrived in the equally long stretch right before it. */
export type ArrivalWindow = {
  count: number;
  previous: number;
};

/** How many cases carry one category; everything is null for the ones the triage has not seen. */
export type CategoryCount = {
  id: string | null;
  name: string | null;
  color: CaseCategoryColor | null;
  count: number;
};

/** How many cases sit on one tier; `tier` is null for the ones still waiting for a verdict. */
export type TierCount = {
  tier: CaseTier | null;
  count: number;
};

/** How many cases came in over one channel. Every case has one, so there is no row for none. */
export type ChannelCount = {
  channel: CaseChannel;
  count: number;
};

/**
 * One stretch of the calendar and what arrived in it. The period is ISO text as the server cut
 * it — `2026-09-15T14`, `2026-09-15` or `2026-09` — and is parsed as a local date for its label.
 */
export type ArrivalBucket = {
  period: string;
  count: number;
  /**
   * Keyed by category id, `none` for the uncategorised, and within that by channel; only the
   * combinations this bucket caught. Two levels rather than two maps, so the chart reads the right
   * number whether it is narrowed to a category, to a channel or to both.
   */
  counts: Record<string, Partial<Record<CaseChannel, number>>>;
};

/** What a bucket without a category is keyed by; a category id is a UUID, so it cannot be one. */
export const NO_CATEGORY = 'none';
