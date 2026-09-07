import { Case, CaseCategoryColor, CaseTier } from './case';

/**
 * The inbox seen in groups rather than in rows: every category and tier that occurs, with the
 * cases that fall into it. This is what a person works through when the question is not "what
 * does this mail say" but "what do I do with the seventeen of them".
 *
 * Framework-free, so the grouping can be read and tested without a dialog around it.
 */

export type ReviewGroup = {
  /**
   * Stable across reloads: category and tier, the two things the group is made of. The category
   * by name, which is what the line shows and what the table is filtered by when it is shown.
   */
  key: string;
  categoryName: string | null;
  categoryColor: CaseCategoryColor | null;
  tier: CaseTier | null;
  cases: Case[];
};

/**
 * The order the groups are worked through. What needs nobody's attention comes first, because
 * getting rid of it is the point of the review; what needs a person comes last, and the cases the
 * triage has not seen yet close the list — there is nothing to decide about them here.
 */
const TIER_REVIEW_ORDER: readonly (CaseTier | null)[] = ['ignore', 'info', 'automatic', 'draft', 'manual', null];

/**
 * The cases grouped by category and tier — both, because a category has a usual tier but single
 * cases are overruled, and a mail somebody pulled out of the noise must not vanish with it. Within
 * a tier the largest group comes first, so the biggest pile is the first thing on the table.
 */
export function reviewGroups(cases: Case[]): ReviewGroup[] {
  const groups = new Map<string, ReviewGroup>();
  for (const aCase of cases) {
    const key = `${aCase.categoryName ?? ''}|${aCase.tier ?? ''}`;
    const group = groups.get(key);
    if (group) {
      group.cases.push(aCase);
    } else {
      groups.set(key, {
        key,
        categoryName: aCase.categoryName,
        categoryColor: aCase.categoryColor,
        tier: aCase.tier,
        cases: [aCase],
      });
    }
  }
  return [...groups.values()].sort((one, other) => {
    const byTier = TIER_REVIEW_ORDER.indexOf(one.tier) - TIER_REVIEW_ORDER.indexOf(other.tier);
    if (byTier !== 0) {
      return byTier;
    }
    return other.cases.length - one.cases.length || (one.categoryName ?? '').localeCompare(other.categoryName ?? '');
  });
}

/** Whether a group is one nobody has to read — the ones the review is there to clear away. */
export function needsNoAnswer(group: ReviewGroup): boolean {
  return group.tier === 'ignore' || group.tier === 'info';
}
