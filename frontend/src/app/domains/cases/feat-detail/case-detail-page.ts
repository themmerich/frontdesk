import { DatePipe, PercentPipe } from '@angular/common';
import { Component, computed, effect, inject, input, linkedSignal, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';

import { CaseCategoriesService } from '../data/case-categories-service';
import { CaseDetailService } from '../data/case-detail-service';
import { CaseOrderStore } from '../data/case-order-store';
import { CasesService } from '../data/cases-service';
import { CaseDetail, CaseTier } from '../model/case';
import { mailDocument, pointsAtRemoteContent } from '../model/mail-html';
import { mailTextParts } from '../model/mail-text';
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
  protected readonly categoriesService = inject(CaseCategoriesService);
  private readonly casesService = inject(CasesService);
  private readonly orderStore = inject(CaseOrderStore);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);
  private readonly transloco = inject(TranslocoService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly router = inject(Router);

  protected readonly isSaving = signal(false);
  protected readonly isDeleting = signal(false);

  /**
   * What a person has picked but not saved yet. Both follow the case they belong to: opening
   * another one starts from what the triage made of that case, not from the last edit.
   */
  protected readonly draftCategoryId = linkedSignal(() => this.detailService.detail.value()?.categoryId ?? null);
  protected readonly draftTier = linkedSignal(() => this.detailService.detail.value()?.tier ?? null);

  /** Nothing to save until something differs from what the case says today. */
  protected readonly isDirty = computed(() => {
    const aCase = this.detailService.detail.value();
    return aCase !== undefined && (this.draftCategoryId() !== aCase.categoryId || this.draftTier() !== aCase.tier);
  });

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

  /**
   * The mail as it is shown: its text cut into the pieces that are addresses and the pieces that
   * are not. Bound as text either way — a mail body comes from a stranger and is never markup.
   */
  /**
   * What the category picker offers: the categories the tenant keeps, and the choice of none at
   * all. A case that sits in a category which has since been retired keeps it in the list, so
   * opening the case does not quietly file it somewhere else.
   */
  protected readonly categoryOptions = computed(() => {
    this.translation();
    const current = this.detailService.detail.value();
    // value() throws while the resource is in the error state, and a list that cannot be loaded
    // must not take the whole page with it: the case is still readable, only the choice is gone.
    const categories = this.categoriesService.categories.error() ? [] : this.categoriesService.categories.value();
    const known = categories.some((category) => category.id === current?.categoryId);
    return [
      { label: this.transloco.translate('caseDetail.noCategory'), value: null },
      ...(known || current?.categoryId === undefined || current?.categoryId === null
        ? []
        : [{ label: current.categoryName ?? '', value: current.categoryId }]),
      ...categories.map((category) => ({ label: category.name, value: category.id })),
    ];
  });

  protected readonly bodyParts = computed(() => mailTextParts(this.detailService.detail.value()?.bodyText ?? ''));

  /** The mail as it was written, where that was HTML; null where the mail is plain text. */
  protected readonly bodyHtml = computed(() => this.detailService.detail.value()?.bodyHtml ?? null);

  /**
   * Whether the pictures the mail points at may be fetched. Off for every mail: fetching one
   * tells the sender that this mail was opened, at this minute, from here — which is what a
   * tracking pixel is for. Re-anchored on the case, so a yes never carries over to the next mail.
   */
  protected readonly showRemoteContent = linkedSignal<string | undefined, boolean>({
    source: () => this.detailService.detail.value()?.id,
    computation: () => false,
  });

  protected readonly hasRemoteContent = computed(() => {
    const html = this.bodyHtml();
    return html !== null && pointsAtRemoteContent(html);
  });

  /**
   * The mail as a document for the frame below. Angular is told to keep its hands off it, which
   * needs saying twice: what it would do here is sanitize the mail into something else, and what
   * keeps the page safe is the frame around it instead — sandboxed without scripts and without
   * an origin of its own, with a policy in the document's own head on top. The mail can neither
   * run anything nor read anything of this page.
   */
  protected readonly mailDocument = computed<SafeHtml | null>(() => {
    const html = this.bodyHtml();
    return html === null ? null : this.sanitizer.bypassSecurityTrustHtml(mailDocument(html, this.showRemoteContent()));
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

  /**
   * Both corrections in one request: the category and the tier are saved together, so a case
   * never ends up half corrected because the second call did not get through.
   */
  protected async onSave(): Promise<void> {
    const tier = this.draftTier();
    if (tier === null) {
      return;
    }
    this.isSaving.set(true);
    try {
      await this.detailService.changeClassification(this.draftCategoryId(), tier);
      // The inbox shows the tier and draws its rows in the category's colour, one page back.
      this.casesService.cases.reload();
      this.toast('success', 'caseDetail.saved');
    } catch {
      this.toast('error', 'caseDetail.saveError');
    } finally {
      this.isSaving.set(false);
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
