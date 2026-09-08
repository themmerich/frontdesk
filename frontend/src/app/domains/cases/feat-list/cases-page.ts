import { Component, computed, inject, input, signal } from '@angular/core';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { ActivatedRoute, Router } from '@angular/router';
import { ConfirmationService, MessageService } from 'primeng/api';

import { CaseCategoriesService } from '../data/case-categories-service';
import { CaseColumnsService } from '../data/case-columns-service';
import { CaseOrderStore } from '../data/case-order-store';
import { CasesService } from '../data/cases-service';
import { Case, CasePile, CaseTier } from '../model/case';
import { ReviewGroup } from '../model/case-review';
import { CaseList } from '../ui/case-list';

@Component({
  selector: 'app-cases-page',
  imports: [TranslocoDirective, CaseList],
  templateUrl: './cases-page.html',
})
export class CasesPage {
  /**
   * Which pile this page shows, bound from the route: what is left to do, what was worked
   * through, and what somebody threw away. One page for all three, because everything else about
   * them — the table, deleting, filing, opening a case — is the same thing.
   *
   * <p>Read through the two below rather than compared against 'inbox' anywhere: the router sets
   * an input the route does not name to undefined, so the inbox is what is left over, not what
   * says its own name.
   */
  readonly pile = input<CasePile>('inbox');

  protected readonly casesService = inject(CasesService);
  protected readonly columnsService = inject(CaseColumnsService);
  protected readonly categoriesService = inject(CaseCategoriesService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);
  private readonly transloco = inject(TranslocoService);
  private readonly orderStore = inject(CaseOrderStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  /** Whether the review stands open in front of the table. */
  protected readonly reviewOpen = signal(false);

  protected readonly cases = computed(() => {
    switch (this.pile()) {
      case 'archive':
        return this.casesService.archivedCases();
      case 'trash':
        return this.casesService.trashedCases();
      default:
        return this.casesService.openCases();
    }
  });

  /**
   * What tells the three pages apart: the name their view is remembered under, the heading, the
   * word for an empty table, the name of the CSV, and which actions make sense where. The review
   * works through what is open; putting back is the archive's, fetching back the trash's; and
   * deleting means the trash everywhere except in the trash itself, where it means for good.
   */
  private readonly page = computed(() => {
    switch (this.pile()) {
      case 'archive':
        return { viewKey: 'frontdesk-archive-table', title: 'cases.archiveTitle', empty: 'cases.emptyArchive', file: 'archive' };
      case 'trash':
        return { viewKey: 'frontdesk-trash-table', title: 'cases.trashTitle', empty: 'cases.emptyTrash', file: 'trash' };
      default:
        return { viewKey: 'frontdesk-case-table', title: 'cases.title', empty: 'cases.empty', file: 'cases' };
    }
  });

  protected readonly viewKey = computed(() => this.page().viewKey);
  protected readonly titleKey = computed(() => this.page().title);
  protected readonly emptyKey = computed(() => this.page().empty);
  protected readonly exportFilename = computed(() => this.page().file);
  protected readonly inTrash = computed(() => this.pile() === 'trash');
  protected readonly inArchive = computed(() => this.pile() === 'archive');
  protected readonly inInbox = computed(() => !this.inTrash() && !this.inArchive());

  constructor() {
    // Coming back from the summaries means coming back to the review, not merely to the inbox:
    // the reader left in the middle of working through it. Read once and then taken out of the
    // address, so a reload or a bookmark of this page is the plain inbox again.
    if (this.route.snapshot.queryParamMap.has('review')) {
      this.reviewOpen.set(true);
      void this.router.navigate([], { relativeTo: this.route, queryParams: {}, replaceUrl: true });
    }
  }

  /** The summaries of a group have a page of their own; the group travels in the address. */
  protected onSummariesRequested(group: ReviewGroup): void {
    void this.router.navigate(['/review'], { queryParams: { category: group.categoryName ?? '', tier: group.tier ?? '' } });
  }

  /** What the detail view pages through: the order as it stands after filter and sorting. */
  protected onOrderChanged(ids: string[]): void {
    this.orderStore.set(ids);
  }

  /** Saving what was picked in a row; the table only said what a person made of the case. */
  protected async onClassificationChanged(change: { id: string; categoryId: string | null; tier: CaseTier | null }): Promise<void> {
    try {
      await this.casesService.changeClassification(change.id, change.categoryId, change.tier);
      this.messageService.add({ severity: 'success', summary: this.transloco.translate('cases.classificationSaved') });
    } catch {
      this.messageService.add({ severity: 'error', summary: this.transloco.translate('cases.classificationError') });
    }
  }

  /**
   * Out of the archive and back into the inbox. No question first — nothing is lost by it, and
   * the same row action puts it back. A word about it all the same: the row leaves the page it
   * was clicked on, and where it went should not have to be guessed.
   */
  protected async onReopenRequested(aCase: Case): Promise<void> {
    try {
      await this.casesService.markHandled(aCase.id, false);
      this.messageService.add({ severity: 'success', summary: this.transloco.translate('cases.reopened') });
    } catch {
      this.messageService.add({ severity: 'error', summary: this.transloco.translate('cases.reopenError') });
    }
  }

  protected onCaseOpened(aCase: Case): void {
    void this.router.navigate(['/cases', aCase.id]);
  }

  /**
   * Deleting is the page's job: the list only says what the user picked. Nothing goes without the
   * question — a deleted mail cannot be fetched again, the mailbox has long marked it as read.
   */
  protected onDeleteRequested(cases: Case[]): void {
    if (cases.length === 0) {
      return;
    }
    // In the trash the question is the last one there is, so it says so and reads differently.
    const forGood = this.inTrash();
    const one = cases.length === 1;
    this.confirmationService.confirm({
      header: this.transloco.translate(forGood ? 'cases.purgeHeader' : 'cases.deleteHeader'),
      // One case is named, several are counted: a list of twenty subjects in a
      // dialog is not read, it is clicked away.
      message: one
        ? this.transloco.translate(forGood ? 'cases.purgeOne' : 'cases.deleteOne', { subject: cases[0].subject })
        : this.transloco.translate(forGood ? 'cases.purgeMany' : 'cases.deleteMany', { count: cases.length }),
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: this.transloco.translate(forGood ? 'cases.purgeConfirm' : 'cases.deleteConfirm'),
      rejectLabel: this.transloco.translate('cases.deleteCancel'),
      acceptButtonStyleClass: 'p-button-danger',
      rejectButtonProps: { severity: 'secondary', outlined: true },
      accept: () => void this.remove(cases, forGood),
    });
  }

  private async remove(cases: Case[], forGood: boolean): Promise<void> {
    const one = cases.length === 1;
    try {
      const ids = cases.map((aCase) => aCase.id);
      await (forGood ? this.casesService.purge(ids) : this.casesService.remove(ids));
      this.messageService.add({
        severity: 'success',
        summary: one
          ? this.transloco.translate(forGood ? 'cases.purgedOne' : 'cases.deletedOne')
          : this.transloco.translate(forGood ? 'cases.purgedMany' : 'cases.deletedMany', { count: cases.length }),
      });
    } catch {
      this.messageService.add({ severity: 'error', summary: this.transloco.translate('cases.deleteError') });
    }
  }

  /**
   * Out of the trash. No question first: this is the undo of a deletion, and what it undoes was
   * asked about already. Where the case lands is where it was, so the word for it says no more.
   */
  protected async onRestoreRequested(aCase: Case): Promise<void> {
    try {
      await this.casesService.restore([aCase.id]);
      this.messageService.add({ severity: 'success', summary: this.transloco.translate('cases.restored') });
    } catch {
      this.messageService.add({ severity: 'error', summary: this.transloco.translate('cases.restoreError') });
    }
  }
}
