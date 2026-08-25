import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import { DatePipe, PercentPipe } from '@angular/common';
import { Component, computed, inject, input, model, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { MultiSelectModule } from 'primeng/multiselect';
import { PopoverModule } from 'primeng/popover';
import { Table, TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';

import { Case, CaseTier } from '../model/case';
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
    PercentPipe,
    FormsModule,
    TranslocoDirective,
    ButtonModule,
    CheckboxModule,
    IconFieldModule,
    InputIconModule,
    InputTextModule,
    MultiSelectModule,
    PopoverModule,
    TableModule,
    TagModule,
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

  protected readonly globalFilterFields: CaseColumnField[] = ['sender', 'subject', 'summary', 'category'];

  /** Options of the tier multi-select filter, matching the raw values the rows carry. */
  protected readonly tierOptions = computed<{ label: string; value: CaseTier }[]>(() => {
    this.translation();
    return [
      { label: this.transloco.translate('cases.tierAutomatic'), value: 'automatic' },
      { label: this.transloco.translate('cases.tierDraft'), value: 'draft' },
      { label: this.transloco.translate('cases.tierManual'), value: 'manual' },
    ];
  });

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

  /** The tag's label and colour per tier; a tier is a small closed set, so both are spelled out. */
  protected tierLabelKey(tier: CaseTier): string {
    return { automatic: 'cases.tierAutomatic', draft: 'cases.tierDraft', manual: 'cases.tierManual' }[tier];
  }

  protected tierSeverity(tier: CaseTier): 'success' | 'warn' | 'info' {
    // Green: frontdesk handles it. Amber: waiting for a person to approve.
    // Blue: a person has to take it over.
    return { automatic: 'success', draft: 'warn', manual: 'info' }[tier] as 'success' | 'warn' | 'info';
  }

  protected onExportCsv(): void {
    this.table().exportCSV();
  }
}
