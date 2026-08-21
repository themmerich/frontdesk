import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import { DatePipe } from '@angular/common';
import { Component, computed, inject, input, model, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { PopoverModule } from 'primeng/popover';
import { Table, TableModule } from 'primeng/table';

import { Case } from '../model/case';
import { CASE_COLUMNS, CaseColumnDefinition, CaseColumnField, DEFAULT_COLUMN_ORDER } from '../model/case-column';
import { FileSizePipe } from './file-size-pipe';

type CaseColumn = Omit<CaseColumnDefinition, 'labelKey'> & { header: string };

@Component({
  selector: 'app-case-list',
  imports: [
    CdkDrag,
    CdkDragHandle,
    CdkDropList,
    DatePipe,
    FileSizePipe,
    FormsModule,
    TranslocoDirective,
    ButtonModule,
    CheckboxModule,
    IconFieldModule,
    InputIconModule,
    InputTextModule,
    PopoverModule,
    TableModule,
  ],
  templateUrl: './case-list.html',
})
export class CaseList {
  private readonly transloco = inject(TranslocoService);

  readonly cases = input.required<Case[]>();

  // Column order (drag & drop) and visibility (checkboxes) as in the PrimeNG
  // column-toggle demo. Two-way bound, so the page can hand them to the store
  // that persists them; unbound they simply start at the defaults.
  readonly columnOrder = model<CaseColumnField[]>([...DEFAULT_COLUMN_ORDER]);
  readonly visibleFields = model<CaseColumnField[]>([...DEFAULT_COLUMN_ORDER]);

  private readonly table = viewChild.required(Table);

  protected readonly globalFilterFields: CaseColumnField[] = ['sender', 'subject'];

  // Re-evaluates the columns once the active translation file (re)loads, so the
  // popover labels, table headers, and CSV export headers are translated.
  private readonly translation = toSignal(this.transloco.selectTranslation());
  protected readonly columns = computed<CaseColumn[]>(() => {
    this.translation();
    return this.columnOrder().map((field) => {
      const { labelKey, ...column } = CASE_COLUMNS.find((caseColumn) => caseColumn.field === field)!;
      return { ...column, header: this.transloco.translate(labelKey) };
    });
  });
  // Drives the table's `columns` input, which also feeds PrimeNG's exportCSV().
  protected readonly visibleColumns = computed(() => this.columns().filter((column) => this.visibleFields().includes(column.field)));

  protected onColumnDrop(event: CdkDragDrop<CaseColumn[]>): void {
    const order = [...this.columnOrder()];
    moveItemInArray(order, event.previousIndex, event.currentIndex);
    this.columnOrder.set(order);
  }

  protected onResetColumns(): void {
    this.columnOrder.set([...DEFAULT_COLUMN_ORDER]);
    this.visibleFields.set([...DEFAULT_COLUMN_ORDER]);
  }

  protected onGlobalSearch(query: string): void {
    this.table().filterGlobal(query, 'contains');
  }

  protected onExportCsv(): void {
    this.table().exportCSV();
  }
}
