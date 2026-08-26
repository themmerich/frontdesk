import { Component, inject } from '@angular/core';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { Router } from '@angular/router';
import { ConfirmationService, MessageService } from 'primeng/api';

import { CaseColumnsService } from '../data/case-columns-service';
import { CaseOrderStore } from '../data/case-order-store';
import { CasesService } from '../data/cases-service';
import { Case } from '../model/case';
import { CaseList } from '../ui/case-list';

@Component({
  selector: 'app-cases-page',
  imports: [TranslocoDirective, CaseList],
  templateUrl: './cases-page.html',
})
export class CasesPage {
  protected readonly casesService = inject(CasesService);
  protected readonly columnsService = inject(CaseColumnsService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);
  private readonly transloco = inject(TranslocoService);
  private readonly orderStore = inject(CaseOrderStore);
  private readonly router = inject(Router);

  /** What the detail view pages through: the order as it stands after filter and sorting. */
  protected onOrderChanged(ids: string[]): void {
    this.orderStore.set(ids);
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
    this.confirmationService.confirm({
      header: this.transloco.translate('cases.deleteHeader'),
      // One case is named, several are counted: a list of twenty subjects in a
      // dialog is not read, it is clicked away.
      message:
        cases.length === 1
          ? this.transloco.translate('cases.deleteOne', { subject: cases[0].subject })
          : this.transloco.translate('cases.deleteMany', { count: cases.length }),
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: this.transloco.translate('cases.deleteConfirm'),
      rejectLabel: this.transloco.translate('cases.deleteCancel'),
      acceptButtonStyleClass: 'p-button-danger',
      rejectButtonProps: { severity: 'secondary', outlined: true },
      accept: () => void this.remove(cases),
    });
  }

  private async remove(cases: Case[]): Promise<void> {
    try {
      await this.casesService.remove(cases.map((aCase) => aCase.id));
      this.messageService.add({
        severity: 'success',
        summary:
          cases.length === 1
            ? this.transloco.translate('cases.deletedOne')
            : this.transloco.translate('cases.deletedMany', { count: cases.length }),
      });
    } catch {
      this.messageService.add({ severity: 'error', summary: this.transloco.translate('cases.deleteError') });
    }
  }
}
