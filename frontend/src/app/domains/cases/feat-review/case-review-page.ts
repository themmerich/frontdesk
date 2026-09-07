import { DatePipe } from '@angular/common';
import { Component, computed, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';

import { CaseOrderStore } from '../data/case-order-store';
import { CasesService } from '../data/cases-service';
import { Case, CaseTier } from '../model/case';
import { reviewGroups } from '../model/case-review';
import { TIER_LABEL_KEY, TIER_SEVERITY, TierSeverity } from '../ui/tier-tag';

/**
 * One group of the review, read rather than decided: the short summary of every mail in it, one
 * below the other, to be skimmed. A page and not a dialog, because this is where a person spends
 * a minute — it can be linked to, the browser's back button works, and walking into a case and
 * back is a normal navigation instead of a lost overlay.
 *
 * Per mail two ways out: taken note of, which drops it out of the review for good, or opened,
 * for the one that turns out to be more than its category says.
 */
@Component({
  selector: 'app-case-review-page',
  imports: [DatePipe, RouterLink, TranslocoDirective, ButtonModule, TagModule],
  templateUrl: './case-review-page.html',
})
export class CaseReviewPage {
  private readonly casesService = inject(CasesService);
  private readonly orderStore = inject(CaseOrderStore);
  private readonly messageService = inject(MessageService);
  private readonly transloco = inject(TranslocoService);
  private readonly router = inject(Router);

  /**
   * Which group is being read, bound straight from the query parameters. The category by name,
   * empty for the cases without one — the review names its groups the same way.
   */
  readonly category = input('');
  readonly tier = input('');

  /**
   * The group as the review sees it, so both show the same thing: the cases nobody has taken
   * note of yet, in the same grouping. Null once the last of them is gone, or when the link was
   * followed to a group that no longer exists.
   */
  protected readonly group = computed(() => {
    const cases = this.casesService.cases.error() ? [] : this.casesService.cases.value();
    const group = reviewGroups(cases).find(
      (candidate) => (candidate.categoryName ?? '') === this.category() && (candidate.tier ?? '') === this.tier(),
    );
    return group ?? null;
  });

  /** The way back: the review the reader came from, opened again rather than merely the inbox. */
  protected readonly backQueryParams = { review: 1 };

  /**
   * Taken note of. No confirmation and no toast: the card disappearing says it, the next one
   * moves up, and a question per mail would make skimming twenty of them unbearable. Nothing is
   * lost either way — the case stays in the inbox, this only takes it out of the review. Taking
   * that back is a thing the backend can do; no screen offers it yet.
   */
  protected async onHandled(aCase: Case): Promise<void> {
    try {
      await this.casesService.markHandled(aCase.id, true);
    } catch {
      this.messageService.add({ severity: 'error', summary: this.transloco.translate('caseReview.handledError') });
    }
  }

  /**
   * Into the case. What "the next one" means over there is this group, not the table behind it:
   * whoever walks in from here walks through what they were reading.
   */
  protected onOpen(aCase: Case): void {
    this.orderStore.set(this.group()?.cases.map((row) => row.id) ?? []);
    void this.router.navigate(['/cases', aCase.id]);
  }

  protected tierLabelKey(tier: CaseTier): string {
    return TIER_LABEL_KEY[tier];
  }

  protected tierSeverity(tier: CaseTier): TierSeverity {
    return TIER_SEVERITY[tier];
  }
}
