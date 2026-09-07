import { Component, computed, inject, input, model, output } from '@angular/core';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { TagModule } from 'primeng/tag';

import { Case, CaseTier } from '../model/case';
import { needsNoAnswer, ReviewGroup, reviewGroups } from '../model/case-review';
import { TIER_LABEL_KEY, TIER_SEVERITY, TierSeverity } from './tier-tag';

/**
 * The inbox worked through in groups: one line per category and tier, with what can be done about
 * the whole group. What needs nobody is cleared away here — deleted, or read first on the page
 * that carries the summaries; what needs a person is handed to the table, filtered to that group.
 *
 * Dumb like the list: it says what was picked, the list and the page do it. Groups that were
 * dealt with fall out with the next reload; the dialog stays open until there is nothing left.
 */
@Component({
  selector: 'app-case-review-dialog',
  imports: [TranslocoDirective, ButtonModule, DialogModule, TagModule],
  templateUrl: './case-review-dialog.html',
})
export class CaseReviewDialog {
  private readonly transloco = inject(TranslocoService);

  readonly cases = input.required<Case[]>();

  readonly visible = model(false);

  /** The cases of a group somebody wants gone. Asking and deleting is the page's job. */
  readonly deleteRequested = output<Case[]>();

  /** A group somebody wants to see in the table — the list turns it into its filters. */
  readonly groupShown = output<ReviewGroup>();

  /** A group somebody wants to read: the summaries have a page of their own. */
  readonly summariesRequested = output<ReviewGroup>();

  protected readonly groups = computed(() => reviewGroups(this.cases()));

  protected readonly needsNoAnswer = needsNoAnswer;

  /**
   * What a group is called in the name of its buttons: several groups share a line of buttons,
   * so "delete" alone would not say which pile is about to go.
   */
  protected groupName(group: ReviewGroup): string {
    return group.categoryName ?? this.transloco.translate('cases.noCategory');
  }

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
