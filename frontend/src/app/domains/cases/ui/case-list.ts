import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import { DatePipe, DOCUMENT } from '@angular/common';
import {
  afterRenderEffect,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  linkedSignal,
  model,
  output,
  signal,
  viewChild,
} from '@angular/core';
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
import { CaseDateGroupKind, caseDateGroup } from '../model/case-date-group';
import {
  ACTIONS_COLUMN,
  CASE_COLUMNS,
  CaseColumnDefinition,
  CaseColumnField,
  CaseColumnWidthKey,
  CaseColumnWidths,
  DEFAULT_COLUMN_ORDER,
  SELECTION_COLUMN,
} from '../model/case-column';
import { FileSizePipe } from './file-size-pipe';

type CaseColumn = Omit<CaseColumnDefinition, 'labelKey'> & { header: string };

/**
 * A case with the stretch of time it is filed under. The table groups by a field on the row and
 * sorts the groups by its value, so the row carries the beginning of its stretch as a number and
 * the heading to write above it.
 */
type GroupedCase = Case & { receivedGroup: number; receivedGroupLabel: string };

/** The heading of a stretch, except for the months, which are named after themselves. */
const GROUP_LABELS: Record<Exclude<CaseDateGroupKind, 'earlier'>, string> = {
  today: 'cases.groupToday',
  yesterday: 'cases.groupYesterday',
  week: 'cases.groupThisWeek',
  month: 'cases.groupThisMonth',
};

/** Where PrimeNG keeps what the table remembers: filters, sorting, and the resized widths. */
const STATE_KEY = 'frontdesk-case-table';

/** Newest first, which is what the inbox opens with and what a reset puts back. */
const DEFAULT_SORT_FIELD = 'receivedAt';
const DEFAULT_SORT_ORDER = -1;

/** How many rows a page holds until someone chooses otherwise. */
const DEFAULT_ROWS = 25;

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
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /**
   * No storage, no state: where localStorage is missing or blocked, the table simply forgets
   * again instead of failing — PrimeNG reads the storage on every save and restore, and an
   * absent `stateKey` is what switches all of that off.
   */
  protected readonly stateKey = this.storage === null ? undefined : STATE_KEY;

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

  /**
   * What each column was dragged to, by column rather than by position. The table's own state
   * keeps widths by position, where hiding one column moves every width behind it onto its
   * neighbour. Two-way bound like the order and the visibility, so the page persists all three
   * together; unbound, the columns simply size themselves.
   */
  readonly columnWidths = model<CaseColumnWidths>({});

  private readonly table = viewChild.required(Table);

  protected readonly defaultRows = DEFAULT_ROWS;

  /** The names the two fixed columns are remembered under; the others go by their field. */
  protected readonly selectionColumn = SELECTION_COLUMN;
  protected readonly actionsColumn = ACTIONS_COLUMN;

  constructor() {
    // The widths as PrimeNG wants them: one per rendered column, in the order they stand. It
    // applies them itself on load, and from here on they are handed over again for whatever
    // arrangement is on screen — after a column was hidden, shown, or moved.
    afterRenderEffect(() => {
      const widths = this.renderedWidths();
      const table = this.table();
      table.destroyStyleElement();
      table.columnWidthsState = widths;
      if (widths !== undefined) {
        table.restoreColumnWidths();
      }
    });
  }

  protected readonly globalFilterFields: CaseColumnField[] = ['sender', 'recipient', 'subject', 'categoryName'];

  /** What stands in the search box; kept here so a restored global filter can be shown in it. */
  protected readonly globalSearch = signal('');

  /**
   * Options of the category multi-select filter: the categories the inbox actually holds, in
   * alphabetical order. They are the tenant's own wording and change with the triage settings,
   * so they are read off the cases rather than spelled out anywhere.
   */
  protected readonly categoryOptions = computed<string[]>(() => {
    const names = this.cases()
      .map((aCase) => aCase.categoryName)
      .filter((name) => name !== null);
    return [...new Set(names)].sort((one, other) => one.localeCompare(other));
  });

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
  /**
   * The rows as the table sees them: every case with the stretch of time it belongs to. Read off
   * the clock of the moment they are built, which is what makes "today" today even when the page
   * has been open since yesterday — the list reloads every ten seconds and this is built with it.
   */
  protected readonly rows = computed<GroupedCase[]>(() => {
    this.translation();
    const now = new Date();
    const month = new Intl.DateTimeFormat(this.transloco.getActiveLang(), { month: 'long' });
    const monthAndYear = new Intl.DateTimeFormat(this.transloco.getActiveLang(), { month: 'long', year: 'numeric' });
    return this.cases().map((aCase) => {
      const group = caseDateGroup(aCase.receivedAt, now);
      const sameYear = group.start.getFullYear() === now.getFullYear();
      return {
        ...aCase,
        receivedGroup: group.start.getTime(),
        receivedGroupLabel:
          group.kind === 'earlier'
            ? (sameYear ? month : monthAndYear).format(group.start)
            : this.transloco.translate(GROUP_LABELS[group.kind]),
      };
    });
  });

  /**
   * Which column the table is sorted by, as far as this component needs to know: the stretches
   * only group a list that is in the order they are about. Sorted by anything else — by sender,
   * say — they would cut that order into pieces, so they step aside.
   */
  private readonly sortedBy = signal<string | null>(DEFAULT_SORT_FIELD);
  protected readonly groupField = computed(() => (this.sortedBy() === DEFAULT_SORT_FIELD ? 'receivedGroup' : undefined));
  // Without a mode there is no heading at all: with only the field taken away, the table would
  // still write one above the first row of the list.
  protected readonly groupMode = computed<'subheader' | undefined>(() => (this.groupField() ? 'subheader' : undefined));

  protected onSortChanged(): void {
    this.sortedBy.set(this.table().sortField ?? null);
  }

  // What the header and the body render, and what the CSV export is handed.
  protected readonly visibleColumns = computed(() => this.columns().filter((column) => this.visibleFields().includes(column.field)));

  /**
   * The widths of the columns now on screen, in their order and with the two fixed ones around
   * them — or nothing at all while a single one of them is unknown, because the table reads the
   * list by position and a gap would shift every column behind it. Unknown means a column that
   * was not on screen when a width was last dragged; the next drag fills it in.
   */
  private readonly renderedWidths = computed<string | undefined>(() => {
    const widths = this.columnWidths();
    const rendered: CaseColumnWidthKey[] = [SELECTION_COLUMN, ...this.visibleColumns().map((column) => column.field), ACTIONS_COLUMN];
    const values = rendered.map((column) => widths[column]);
    return values.every((width) => width !== undefined) ? values.join(',') : undefined;
  });

  /**
   * A drag on a resize handle changes the column and its neighbour, and in fit mode every width
   * is a share of the same table — so all of them are read back, not only the one that was
   * dragged. The header cells say which column they are, and that is what turns a position into
   * a column that keeps its width when the arrangement changes.
   */
  protected onColumnResized(): void {
    const headers = this.host.nativeElement.querySelectorAll<HTMLElement>('thead th[data-column]');
    const measured: CaseColumnWidths = {};
    for (const header of headers) {
      measured[header.dataset['column'] as keyof CaseColumnWidths] = Math.round(header.getBoundingClientRect().width);
    }
    this.columnWidths.update((widths) => ({ ...widths, ...measured }));
  }

  protected onColumnDrop(event: CdkDragDrop<CaseColumn[]>): void {
    const order = [...this.columnOrder()];
    moveItemInArray(order, event.previousIndex, event.currentIndex);
    this.columnOrder.set(order);
  }

  protected onResetColumns(): void {
    this.columnOrder.set([...DEFAULT_COLUMN_ORDER]);
    this.visibleFields.set([...DEFAULT_COLUMN_ORDER]);
    // Reset means the table as it comes, so the dragged widths go with the order and the choice.
    this.columnWidths.set({});
  }

  /**
   * The table as it comes: sorting, filters and search go, and so do the columns, their order
   * and their widths. What was remembered of all that goes with it — the table's own entry
   * through clearState(), the columns through the defaults the page then stores nothing for.
   */
  protected onResetView(): void {
    const table = this.table();
    table.clear();
    this.globalSearch.set('');
    // clear() leaves the table with no sorting at all; these two are what it opens with, and
    // they are set the same way the table sets them when it restores its own state.
    table.sortField = DEFAULT_SORT_FIELD;
    table.sortOrder = DEFAULT_SORT_ORDER;
    this.sortedBy.set(DEFAULT_SORT_FIELD);
    table.sortSingle();
    this.onResetColumns();
    table.clearState();
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
    // JSON.stringify leaves the undefined entries out, so what lands in the storage has no
    // selection at all — not an empty one that would still be restored over the current tick.
    // The page one happened to stand on goes the same way: mail arrives at the top, so the
    // inbox opens there rather than in the middle of a list that has moved since. How many
    // rows a page holds is a preference and stays. The widths the table measured are kept by
    // column here, and put back in the shape it reads them, for the arrangement on screen.
    const stored = {
      ...state,
      columnWidths: this.renderedWidths(),
      tableWidth: undefined,
      selection: undefined,
      first: undefined,
      // Sorting by the group and then by the column is how the table lays the stretches of time
      // out; sortField and sortOrder say all of that, and the group is worked out again anyway.
      multiSortMeta: undefined,
    };
    // Back at the table as it comes there is nothing to remember, and the entry goes rather than
    // being written again — the same rule the column preferences follow, and what lets the reset
    // leave nothing behind even when something sorts once more after it.
    if (this.isDefaultState(stored)) {
      this.storage?.removeItem(STATE_KEY);
      return;
    }
    this.storage?.setItem(STATE_KEY, JSON.stringify(stored));
  }

  /** Nothing sorted differently, nothing filtered, nothing searched, nothing dragged, no page size. */
  private isDefaultState(state: TableState): boolean {
    const filters = Object.values(state.filters ?? {}).flat();
    return (
      state.sortField === DEFAULT_SORT_FIELD &&
      state.sortOrder === DEFAULT_SORT_ORDER &&
      (state.rows ?? DEFAULT_ROWS) === DEFAULT_ROWS &&
      this.renderedWidths() === undefined &&
      filters.every((filter) => filter.value === null || filter.value === undefined)
    );
  }

  /**
   * The table restores its own filters, but not the box the global one was typed into: without
   * this the rows would come back filtered under an empty search field, with no way to see why.
   */
  protected onStateRestore(state: TableState): void {
    // The global filter is a single entry; only a column filter can be a list of them.
    const global = state.filters?.['global'];
    this.globalSearch.set(global !== undefined && !Array.isArray(global) ? String(global.value ?? '') : '');

    // What was sorted last time decides whether the stretches group the list.
    this.sortedBy.set(state.sortField ?? null);

    // A state that carries no page — one written before the table had a paginator, and every
    // one written since, because the page is deliberately not remembered — is handed to the
    // table as undefined all the same: it then counts to NaN and shows no row at all. Both
    // values go back to what the table opens with.
    const table = this.table();
    if (table.rows() === undefined) {
      table.rows.set(DEFAULT_ROWS);
    }
    if (table.first() === undefined) {
      table.first.set(0);
    }
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
