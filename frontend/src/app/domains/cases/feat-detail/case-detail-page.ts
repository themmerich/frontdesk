import { BreakpointObserver } from '@angular/cdk/layout';
import { DatePipe, DOCUMENT, PercentPipe } from '@angular/common';
import { Component, computed, effect, inject, input, linkedSignal, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Router, RouterLink } from '@angular/router';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { ConfirmationService, MessageService } from 'primeng/api';
import { map } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { SplitterModule } from 'primeng/splitter';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
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
 * One case in full: the mail as it arrived, what the triage made of it, the reply the model wrote
 * to it, and what a person can do about both — correct the verdict, and edit the reply.
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
    InputTextModule,
    MessageModule,
    SelectModule,
    SplitterModule,
    TagModule,
    TextareaModule,
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
  private readonly breakpoints = inject(BreakpointObserver);
  private readonly storage = inject(DOCUMENT).defaultView?.localStorage ?? null;

  protected readonly isSaving = signal(false);
  protected readonly isDeleting = signal(false);
  protected readonly isHandling = signal(false);
  protected readonly isGenerating = signal(false);

  /**
   * What a person has picked but not saved yet. Both follow the case they belong to: opening
   * another one starts from what the triage made of that case, not from the last edit.
   */
  protected readonly draftCategoryId = linkedSignal(() => this.detailService.detail.value()?.categoryId ?? null);
  protected readonly draftTier = linkedSignal(() => this.detailService.detail.value()?.tier ?? null);

  /**
   * The reply as it stands in the box, empty for a case nothing has been written for yet.
   * Re-anchored on the case like the two above, and on a new draft from the model, which replaces
   * whatever was typed.
   */
  protected readonly draftText = linkedSignal(() => this.detailService.detail.value()?.draftText ?? '');

  /** Whether a reply is saved on the case, the model's or a person's. Decides what the button beside the line offers. */
  protected readonly hasSavedDraft = computed(() => (this.detailService.detail.value()?.draftText ?? null) !== null);

  /**
   * A line for the model: what the reply should do — "decline, and name our availability this
   * year" — or, with a draft there, what to change about it. Handed over with the request and
   * not kept; starts empty for every case.
   */
  protected readonly draftInstruction = linkedSignal<string | undefined, string>({
    source: () => this.detailService.detail.value()?.id,
    computation: () => '',
  });

  private readonly isClassificationDirty = computed(() => {
    const aCase = this.detailService.detail.value();
    return aCase !== undefined && (this.draftCategoryId() !== aCase.categoryId || this.draftTier() !== aCase.tier);
  });

  private readonly isDraftDirty = computed(() => {
    const aCase = this.detailService.detail.value();
    // An empty box over a case without a draft is where things start, not an edit.
    return aCase !== undefined && this.draftText() !== (aCase.draftText ?? '');
  });

  /** Nothing to save until something differs from what the case says today — the verdict or the reply. */
  protected readonly isDirty = computed(() => this.isClassificationDirty() || this.isDraftDirty());

  /**
   * A box with nothing in it, or nothing but blanks. Not a draft, and not worth a request: an
   * emptied draft is not saved over the one there is, and the verdict alone is saved on its own.
   */
  private readonly isDraftBlank = computed(() => this.draftText().trim() === '');
  protected readonly canSave = computed(() => this.isClassificationDirty() || (this.isDraftDirty() && !this.isDraftBlank()));

  /**
   * Whether a person has changed the saved draft since the model wrote it. A draft the model never
   * wrote counts as edited: everything in it is a person's.
   */
  protected readonly isDraftEdited = computed(() => {
    const aCase = this.detailService.detail.value();
    if (aCase === undefined || aCase.draftUpdatedAt === null) {
      return false;
    }
    return aCase.draftGeneratedAt === null || aCase.draftUpdatedAt.getTime() !== aCase.draftGeneratedAt.getTime();
  });

  /** Null when the page was opened through a link: there is no list to page through. */
  protected readonly neighbours = computed(() => this.orderStore.neighboursOf(this.id()));

  /**
   * Whether somebody has taken note of this case already. One that has offers the way back rather
   * than the way there; one in the trash offers neither, because the trash has its own two.
   */
  protected readonly isHandled = computed(() => (this.detailService.detail.value()?.handledAt ?? null) !== null);
  protected readonly isTrashed = computed(() => (this.detailService.detail.value()?.deletedAt ?? null) !== null);

  /**
   * Whether the mail and its reply stand beside each other or one under the other. Tailwind's
   * xl, read through the same media query rather than a class, because the splitter between the
   * two has to be told which way it runs.
   */
  private readonly isWide = toSignal(this.breakpoints.observe('(min-width: 80rem)').pipe(map((state) => state.matches)), {
    initialValue: this.breakpoints.isMatched('(min-width: 80rem)'),
  });
  protected readonly splitterLayout = computed<'horizontal' | 'vertical'>(() => (this.isWide() ? 'horizontal' : 'vertical'));

  /**
   * Where the line between the two was left, kept per arrangement: a split of the width and a
   * split of the height are two different choices. No storage, no state — as with the table.
   */
  protected readonly splitterStateKey = computed(() =>
    this.storage === null ? null : this.isWide() ? 'frontdesk-case-detail-splitter-wide' : 'frontdesk-case-detail-splitter-stacked',
  );

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

  /**
   * The mail as it is shown: its text cut into the pieces that are addresses and the pieces that
   * are not. Bound as text either way — a mail body comes from a stranger and is never markup.
   */
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

  protected async onSave(): Promise<void> {
    await this.save();
  }

  /**
   * Everything that differs from the case, in one go: the verdict in one request — the category
   * and the tier together, so a case never ends up half corrected — and the reply in another,
   * each only when it changed. Says whether it worked, because ticking a case off saves what is
   * pending first and must stop where this does.
   */
  private async save(): Promise<boolean> {
    this.isSaving.set(true);
    try {
      if (this.isClassificationDirty()) {
        await this.detailService.changeClassification(this.draftCategoryId(), this.draftTier());
      }
      if (this.isDraftDirty() && !this.isDraftBlank()) {
        await this.detailService.saveDraft(this.draftText());
      }
      // The inbox shows the tier, draws its rows in the category's colour, and says whether a
      // reply is waiting — one page back.
      this.casesService.cases.reload();
      this.toast('success', 'caseDetail.saved');
      return true;
    } catch {
      this.toast('error', 'caseDetail.saveError');
      return false;
    } finally {
      this.isSaving.set(false);
    }
  }

  /**
   * The model writes the reply, whatever the case's tier: a first one, or a new one in place of
   * the one there is. Asked first when a person's work would go with it: text typed and not
   * saved, or a saved draft that was edited since the model wrote it.
   */
  protected onGenerate(): void {
    if (!this.isDraftDirty() && !this.isDraftEdited()) {
      void this.generate();
      return;
    }
    this.confirmationService.confirm({
      header: this.transloco.translate('caseDetail.regenerateHeader'),
      message: this.transloco.translate('caseDetail.regenerateMessage'),
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: this.transloco.translate('caseDetail.regenerate'),
      rejectLabel: this.transloco.translate('cases.deleteCancel'),
      rejectButtonProps: { severity: 'secondary', outlined: true },
      accept: () => void this.generate(),
    });
  }

  private async generate(): Promise<void> {
    const instruction = this.draftInstruction().trim();
    this.isGenerating.set(true);
    try {
      await this.detailService.generateDraft(instruction === '' ? null : instruction);
      // Said and done: the line was about this one draft, and the box is clear for the next one.
      this.draftInstruction.set('');
      // The inbox says which cases have a reply waiting.
      this.casesService.cases.reload();
      this.toast('success', 'caseDetail.draftGenerated');
    } catch {
      this.toast('error', 'caseDetail.draftError');
    } finally {
      this.isGenerating.set(false);
    }
  }

  /**
   * Ticked off, or put back into the inbox — and on to the next case either way, as after
   * deleting: the case leaves the list it was being worked through, and staying on it would
   * leave a page nobody came for.
   *
   * <p>What was picked or written above and not yet saved is saved first. "Erledigt" says this
   * case is settled; dropping a correction on the way there would be a strange reading of that.
   */
  protected async onHandled(aCase: CaseDetail): Promise<void> {
    if (this.isDirty() && !(await this.save())) {
      return;
    }
    const handled = !this.isHandled();
    const goTo = this.neighbours()?.next ?? this.neighbours()?.previous ?? null;
    this.isHandling.set(true);
    try {
      await this.casesService.markHandled(aCase.id, handled);
      this.toast('success', handled ? 'cases.markedHandled' : 'cases.reopened');
      await this.router.navigate(goTo === null ? ['/'] : ['/cases', goTo]);
    } catch {
      this.toast('error', handled ? 'cases.markHandledError' : 'cases.reopenError');
    } finally {
      this.isHandling.set(false);
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
