import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import { DatePipe, DOCUMENT } from '@angular/common';
import { Component, computed, inject, input, linkedSignal, model, output, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { TableState } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { IconFieldModule } from 'primeng/iconfield';
import { InputIconModule } from 'primeng/inputicon';
import { InputTextModule } from 'primeng/inputtext';
import { MultiSelectModule } from 'primeng/multiselect';
import { PopoverModule } from 'primeng/popover';
import { Table, TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';

import { Case, CaseTier } from '../model/case';
import { CASE_COLUMNS, CaseColumnDefinition, CaseColumnField, DEFAULT_COLUMN_ORDER } from '../model/case-column';
import { FileSizePipe } from './file-size-pipe';

type CaseColumn = Omit<CaseColumnDefinition, 'labelKey'> & { header: string };

/** Where PrimeNG keeps what the table remembers: filters, sorting, and the resized widths. */
const STATE_KEY = 'frontdesk-case-table';

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
    MultiSelectModule,
    PopoverModule,
    TableModule,
    TagModule,
    TooltipModule,
  ],
  templateUrl: './case-list.html',
})
export class CaseList {
  private readonly transloco = inject(TranslocoService);
  private readonly storage = inject(DOCUMENT).defaultView?.localStorage ?? null;

  protected readonly stateKey = STATE_KEY;

  readonly cases = input.required<Case[]>();

  /**
   * Deleting is the page's job, not the table's: the list says what the user picked, the page
   * asks and calls the backend. Carries the cases rather than their ids, so the question can
   * name what is about to go.
   */
  readonly deleteRequested = output<Case[]>();

  /** A row was opened; routing is the page's job, not the table's. */
  readonly caseOpened = output<Case>();

  /**
   * The order the table currently shows, after filtering and sorting. The detail view pages
   * through exactly this, because "the next one" means the next one on screen.
   */
  readonly orderChanged = output<string[]>();

  /**
   * Re-anchored on every reload, keeping what is still there. A refresh therefore does not
   * silently drop the selection, and rows that were just deleted fall out of it by themselves.
   */
  protected readonly selection = linkedSignal<Case[], Case[]>({
    source: this.cases,
    computation: (cases, previous) => (previous?.value ?? []).filter((selected) => cases.some((current) => current.id === selected.id)),
  });

  // Column order (drag & drop) and visibility (checkboxes) as in the PrimeNG
  // column-toggle demo. Two-way bound, so the page can hand them to the store
  // that persists them; unbound they simply start at the defaults.
  readonly columnOrder = model<CaseColumnField[]>([...DEFAULT_COLUMN_ORDER]);
  readonly visibleFields = model<CaseColumnField[]>([...DEFAULT_COLUMN_ORDER]);

  private readonly table = viewChild.required(Table);

  protected readonly globalFilterFields: CaseColumnField[] = ['sender', 'recipient', 'subject', 'category'];

  /** What stands in the search box; kept here so a restored global filter can be shown in it. */
  protected readonly globalSearch = signal('');

  /** Options of the tier multi-select filter, matching the raw values the rows carry. */
  protected readonly tierOptions = computed<{ label: string; value: CaseTier }[]>(() => {
    this.translation();
    return [
      { label: this.transloco.translate('cases.tierAutomatic'), value: 'automatic' },
      { label: this.transloco.translate('cases.tierDraft'), value: 'draft' },
      { label: this.transloco.translate('cases.tierManual'), value: 'manual' },
      { label: this.transloco.translate('cases.tierInfo'), value: 'info' },
      { label: this.transloco.translate('cases.tierIgnore'), value: 'ignore' },
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
  // What the header and the body render, and what the CSV export is handed.
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
    this.globalSearch.set(query);
    this.table().filterGlobal(query, 'contains');
  }

  /**
   * Everything the table remembers is a view preference — except the ticked rows, which PrimeNG
   * writes along with the rest. A ticked row is the working set of the next click, not something
   * to find again tomorrow: restored, it would put the tick back on mails that are long deleted,
   * and the toolbar's delete would count them. Written again without them, right after PrimeNG.
   */
  protected onStateSave(state: TableState): void {
    // JSON.stringify leaves the undefined entry out, so what lands in the storage has no
    // selection at all — not an empty one that would still be restored over the current tick.
    this.storage?.setItem(STATE_KEY, JSON.stringify({ ...state, selection: undefined }));
  }

  /**
   * The table restores its own filters, but not the box the global one was typed into: without
   * this the rows would come back filtered under an empty search field, with no way to see why.
   */
  protected onStateRestore(state: TableState): void {
    // The global filter is a single entry; only a column filter can be a list of them.
    const global = state.filters?.['global'];
    this.globalSearch.set(global !== undefined && !Array.isArray(global) ? String(global.value ?? '') : '');
  }

  /**
   * A floor for the table, so columns keep a readable width instead of being squeezed to nothing
   * once many of them are shown. Below it the table scrolls sideways within the page rather than
   * pushing the layout out of the viewport. The checkbox and the row action are narrow and come
   * on top of the toggleable ones.
   */
  protected readonly minTableWidth = computed(() => `${this.visibleColumns().length * 9 + 8}rem`);

  /** The tag's label and colour per tier; a tier is a small closed set, so both are spelled out. */
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

  protected onExportCsv(): void {
    const table = this.table();
    // exportCSV() takes its headers and its fields from the table's own `columns`, which a
    // stateful table never fills from the input. Handed over here, where they are needed.
    table.columns = this.visibleColumns();
    table.exportCSV();
  }

  protected onDeleteSelected(): void {
    this.deleteRequested.emit(this.selection());
  }

  /**
   * The order as the table renders it: filtered when a filter is on, and sorted in place by
   * PrimeNG otherwise. Published at the moment a case is opened, which is the only moment it is
   * needed and the only one where it is certainly settled.
   */
  protected publishOrder(): void {
    const table = this.table();
    this.orderChanged.emit(((table.filteredValue ?? table.value) as Case[]).map((row) => row.id));
  }

  /** The row action, and the way in that a keyboard can reach. */
  protected onOpen(row: Case): void {
    this.publishOrder();
    this.caseOpened.emit(row);
  }

  /**
   * A double click anywhere on the row opens it, except on the controls that mean something
   * else — ticking a row twice must not open it.
   */
  protected onRowDoubleClick(event: Event, row: Case): void {
    if ((event.target as HTMLElement).closest('button, input, .p-checkbox')) {
      return;
    }
    this.onOpen(row);
  }

  protected onDeleteRow(row: Case): void {
    // Deliberately not the selection: the row action means this row, whatever is
    // ticked elsewhere.
    this.deleteRequested.emit([row]);
  }
}
