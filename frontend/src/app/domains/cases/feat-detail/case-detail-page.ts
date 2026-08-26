import { DatePipe, PercentPipe } from '@angular/common';
import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';

import { CaseDetailService } from '../data/case-detail-service';
import { CaseOrderStore } from '../data/case-order-store';
import { CasesService } from '../data/cases-service';
import { CaseDetail, CaseTier } from '../model/case';
import { FileSizePipe } from '../ui/file-size-pipe';

/**
 * Green, amber, red for the three tiers that need an answer — rising with the work left to a
 * person. Blue and grey for the two that need none.
 */
type TierSeverity = 'success' | 'warn' | 'danger' | 'info' | 'secondary';

const TIER_SEVERITY: Record<CaseTier, TierSeverity> = {
  automatic: 'success',
  draft: 'warn',
  manual: 'danger',
  info: 'info',
  ignore: 'secondary',
};

/**
 * One case in full: the mail as it arrived, what the triage made of it, and the one decision a
 * person can take on it today — which tier it belongs in.
 */
@Component({
  selector: 'app-case-detail-page',
  imports: [
    DatePipe,
    PercentPipe,
    FileSizePipe,
    FormsModule,
    RouterLink,
    TranslocoDirective,
    ButtonModule,
    MessageModule,
    SelectModule,
    TagModule,
    TooltipModule,
  ],
  templateUrl: './case-detail-page.html',
})
export class CaseDetailPage {
  /** Bound from the route, so navigating between cases re-reads rather than re-creates the page. */
  readonly id = input.required<string>();

  protected readonly detailService = inject(CaseDetailService);
  private readonly casesService = inject(CasesService);
  private readonly orderStore = inject(CaseOrderStore);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);
  private readonly transloco = inject(TranslocoService);
  private readonly router = inject(Router);

  protected readonly isChangingTier = signal(false);
  protected readonly isDeleting = signal(false);

  /** Null when the page was opened through a link: there is no list to page through. */
  protected readonly neighbours = computed(() => this.orderStore.neighboursOf(this.id()));

  constructor() {
    effect(() => this.detailService.id.set(this.id()));
  }

  private readonly translation = toSignal(this.transloco.selectTranslation());
  protected readonly tierOptions = computed<{ label: string; value: CaseTier }[]>(() => {
    this.translation();
    return (['automatic', 'draft', 'manual', 'info', 'ignore'] as CaseTier[]).map((tier) => ({
      label: this.transloco.translate(this.tierLabelKey(tier)),
      value: tier,
    }));
  });

  protected tierLabelKey(tier: CaseTier): string {
    return {
      automatic: 'cases.tierAutomatic',
      draft: 'cases.tierDraft',
      manual: 'cases.tierManual',
      info: 'cases.tierInfo',
      ignore: 'cases.tierIgnore',
    }[tier];
  }

  protected tierSeverity(tier: CaseTier): TierSeverity {
    return TIER_SEVERITY[tier];
  }

  protected async onChangeTier(tier: CaseTier): Promise<void> {
    this.isChangingTier.set(true);
    try {
      await this.detailService.changeTier(tier);
      // The inbox shows the tier too, and it is one page back.
      this.casesService.cases.reload();
      this.toast('success', 'caseDetail.tierChanged');
    } catch {
      this.toast('error', 'caseDetail.tierError');
    } finally {
      this.isChangingTier.set(false);
    }
  }

  protected onGoTo(id: string | null): void {
    if (id !== null) {
      void this.router.navigate(['/cases', id]);
    }
  }

  /**
   * After deleting, the next case rather than the list: tidying up happens in a run, and going
   * back to the inbox every time loses the thread.
   */
  protected onDelete(aCase: CaseDetail): void {
    this.confirmationService.confirm({
      header: this.transloco.translate('cases.deleteHeader'),
      message: this.transloco.translate('cases.deleteOne', { subject: aCase.subject }),
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: this.transloco.translate('cases.deleteConfirm'),
      rejectLabel: this.transloco.translate('cases.deleteCancel'),
      acceptButtonStyleClass: 'p-button-danger',
      rejectButtonProps: { severity: 'secondary', outlined: true },
      accept: () => void this.remove(aCase),
    });
  }

  private async remove(aCase: CaseDetail): Promise<void> {
    const goTo = this.neighbours()?.next ?? this.neighbours()?.previous ?? null;
    this.isDeleting.set(true);
    try {
      await this.casesService.remove([aCase.id]);
      this.toast('success', 'cases.deletedOne');
      await this.router.navigate(goTo === null ? ['/'] : ['/cases', goTo]);
    } catch {
      this.toast('error', 'cases.deleteError');
    } finally {
      this.isDeleting.set(false);
    }
  }

  private toast(severity: 'success' | 'error', translationKey: string): void {
    this.messageService.add({ severity, summary: this.transloco.translate(translationKey) });
  }
}
