import { Component, computed, inject, input, model, output } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { MultiSelectModule } from 'primeng/multiselect';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';

import { Case, CaseTier } from '../model/case';
import { needsNoAnswer, ReviewGroup, reviewGroups, reviewTierRank } from '../model/case-review';
import { TIER_LABEL_KEY, TIER_SEVERITY, TierSeverity } from './tier-tag';

/**
 * A group as the table reads it: the group itself, plus what its columns sort and filter by. The
 * name of the category rather than its absence, so the filter offers "without a category" like any
 * other; the tier's place in the review order, because sorting by the raw word would put
 * "automatic" above "ignore" and say nothing.
 */
type ReviewRow = ReviewGroup & { categoryLabel: string; count: number; tierRank: number };

/**
 * The inbox worked through in groups: one line per category and tier, with what can be done about
 * the whole group. What needs nobody is cleared away here — deleted, or read first on the page
 * that carries the summaries; and every group can be handed to the table behind the dialog,
 * filtered down to itself.
 *
 * Dumb like the list: it says what was picked, the list and the page do it. Groups that were
 * dealt with fall out with the next reload; the dialog stays open until there is nothing left.
 */
@Component({
  selector: 'app-case-review-dialog',
  imports: [FormsModule, TranslocoDirective, ButtonModule, DialogModule, MultiSelectModule, TableModule, TagModule, TooltipModule],
  templateUrl: './case-review-dialog.html',
})
export class CaseReviewDialog {
  private readonly transloco = inject(TranslocoService);

  /** Re-read once the active translation (re)loads, so the labels below are in the right language. */
  private readonly translation = toSignal(this.transloco.selectTranslation());

  readonly cases = input.required<Case[]>();

  readonly visible = model(false);

  /** The cases of a group somebody wants gone. Asking and deleting is the page's job. */
  readonly deleteRequested = output<Case[]>();

  /** A group somebody wants to see in the table — the list turns it into its filters. */
  readonly groupShown = output<ReviewGroup>();

  /** A group somebody wants to read: the summaries have a page of their own. */
  readonly summariesRequested = output<ReviewGroup>();

  protected readonly rows = computed<ReviewRow[]>(() => {
    this.translation();
    const noCategory = this.transloco.translate('cases.noCategory');
    return reviewGroups(this.cases()).map((group) => ({
      ...group,
      categoryLabel: group.categoryName ?? noCategory,
      count: group.cases.length,
      tierRank: reviewTierRank(group.tier),
    }));
  });

  /**
   * What the two multi-selects offer: the categories and the tiers that are actually on the table.
   * Everything the dialog holds is in sight, unlike the inbox, so a filter for a tier that does
   * not occur would only ever produce a list of nothing.
   */
  protected readonly categoryOptions = computed(() =>
    [...new Set(this.rows().map((row) => row.categoryLabel))].sort((one, other) => one.localeCompare(other)),
  );

  protected readonly tierOptions = computed(() =>
    [...new Set(this.rows().map((row) => row.tier))]
      .sort((one, other) => reviewTierRank(one) - reviewTierRank(other))
      .map((tier) => ({
        label: tier === null ? this.transloco.translate('cases.notTriaged') : this.transloco.translate(TIER_LABEL_KEY[tier]),
        value: tier,
      })),
  );

  protected readonly needsNoAnswer = needsNoAnswer;

  protected onSummaries(group: ReviewGroup): void {
    this.summariesRequested.emit(group);
    // The summaries are a page; the dialog would only stand in front of it.
    this.visible.set(false);
  }

  protected onDelete(group: ReviewGroup): void {
    this.deleteRequested.emit(group.cases);
  }

  protected onShow(group: ReviewGroup): void {
    this.groupShown.emit(group);
    // The table is behind the dialog; showing means looking at it.
    this.visible.set(false);
  }

  protected tierLabelKey(tier: CaseTier): string {
    return TIER_LABEL_KEY[tier];
  }

  protected tierSeverity(tier: CaseTier): TierSeverity {
    return TIER_SEVERITY[tier];
  }
}
