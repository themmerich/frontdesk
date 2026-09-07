import { CaseTier } from '../model/case';

/**
 * How a tier is shown: green, amber, red for the three tiers that need an answer — rising with
 * the work left to a person — and blue and grey for the two that need none. One place for the
 * list and the dialog that both put the same tag on the same tier.
 */
export type TierSeverity = 'success' | 'warn' | 'danger' | 'info' | 'secondary';

export const TIER_SEVERITY: Record<CaseTier, TierSeverity> = {
  automatic: 'success',
  draft: 'warn',
  manual: 'danger',
  info: 'info',
  ignore: 'secondary',
};

/** The tag's label per tier; a tier is a small closed set, so every one is spelled out. */
export const TIER_LABEL_KEY: Record<CaseTier, string> = {
  automatic: 'cases.tierAutomatic',
  draft: 'cases.tierDraft',
  manual: 'cases.tierManual',
  info: 'cases.tierInfo',
  ignore: 'cases.tierIgnore',
};
