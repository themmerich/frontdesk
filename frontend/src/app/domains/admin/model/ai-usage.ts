/**
 * What the tenant's AI calls cost, as the cost page reads it: sums per stretch of time, three
 * series for the chart, the price table the amounts rest on, and how many calls carry no amount.
 * Every amount is a number, never null: zero where there was nothing.
 */
export type AiUsage = {
  windows: Record<AiUsageWindowName, AiUsageWindow>;
  /** Exactly thirty days, oldest first, ending today. */
  daily: AiUsageBucket[];
  /** Exactly twelve months, oldest first, ending this month. */
  monthly: AiUsageBucket[];
  /** Every year from the first call to this one, oldest first. */
  yearly: AiUsageBucket[];
  prices: AiUsagePrice[];
  /** Calls in the last thirty days whose model had no price; they are missing from the sums. */
  unpricedCalls: number;
};

export type AiUsageWindowName = 'today' | 'week' | 'month';

export type AiUsageKindName = 'triage' | 'draft' | 'keyTest';

/** How fine the chart cuts the calendar. */
export type AiUsageUnit = 'day' | 'month' | 'year';

export type AiUsageKindTotals = {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
};

export type AiUsageWindow = AiUsageKindTotals & {
  /** The equally long stretch right before this one. */
  previousCostUsd: number;
  byKind: Record<AiUsageKindName, AiUsageKindTotals>;
};

/** One stretch of the calendar and what the calls in it cost, by what they were for. */
export type AiUsageBucket = {
  /** The stretch as ISO text: `2026-09-13`, `2026-09` or `2026`, in the server's zone. */
  period: string;
  triageCostUsd: number;
  draftCostUsd: number;
  keyTestCostUsd: number;
  calls: number;
};

export type AiUsagePrice = {
  model: string;
  inputPerMillion: number;
  outputPerMillion: number;
};
