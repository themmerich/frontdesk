import { CdkDrag, CdkDragDrop, CdkDragHandle, CdkDropList, moveItemInArray } from '@angular/cdk/drag-drop';
import { DatePipe } from '@angular/common';
import { Component, computed, inject, input, model, output, viewChild } from '@angular/core';
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
import { TooltipModule } from 'primeng/tooltip';

import { User } from '../model/user';
import { USER_COLUMNS, UserColumnDefinition, UserColumnField, DEFAULT_COLUMN_ORDER } from '../model/user-column';

type UserColumn = Omit<UserColumnDefinition, 'labelKey'> & { header: string };

@Component({
  selector: 'app-user-list',
  imports: [
    CdkDrag,
    CdkDragHandle,
    CdkDropList,
    DatePipe,
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
  templateUrl: './user-list.html',
})
export class UserList {
  private readonly transloco = inject(TranslocoService);

  readonly users = input.required<User[]>();

  // Column order (drag & drop) and visibility (checkboxes) as in the case
  // list. Two-way bound, so the page can hand them to the service that
  // persists them; unbound they simply start at the defaults.
  readonly columnOrder = model<UserColumnField[]>([...DEFAULT_COLUMN_ORDER]);
  readonly visibleFields = model<UserColumnField[]>([...DEFAULT_COLUMN_ORDER]);

  /** Asks the page to activate or deactivate this user (read-only list, smart page). */
  readonly toggleActive = output<User>();

  private readonly table = viewChild.required(Table);

  protected readonly globalFilterFields: UserColumnField[] = ['displayName', 'email'];

  // Re-evaluates the columns once the active translation file (re)loads, so the
  // popover labels, table headers, and CSV export headers are translated.
  private readonly translation = toSignal(this.transloco.selectTranslation());
  protected readonly columns = computed<UserColumn[]>(() => {
    this.translation();
    return this.columnOrder().map((field) => {
      const { labelKey, ...column } = USER_COLUMNS.find((userColumn) => userColumn.field === field)!;
      return { ...column, header: this.transloco.translate(labelKey) };
    });
  });
  // Drives the table's `columns` input, which also feeds PrimeNG's exportCSV().
  protected readonly visibleColumns = computed(() => this.columns().filter((column) => this.visibleFields().includes(column.field)));

  /** Options of the role multi-select filter; the rows keep the raw role values. */
  protected readonly roleOptions = computed<{ label: string; value: User['role'] }[]>(() => {
    this.translation();
    return [
      { label: this.transloco.translate('users.roleAdmin'), value: 'admin' },
      { label: this.transloco.translate('users.roleUser'), value: 'user' },
    ];
  });

  /** Options of the active multi-select filter, matching the raw boolean values. */
  protected readonly activeOptions = computed<{ label: string; value: boolean }[]>(() => {
    this.translation();
    return [
      { label: this.transloco.translate('users.activeTag'), value: true },
      { label: this.transloco.translate('users.inactiveTag'), value: false },
    ];
  });

  protected onColumnDrop(event: CdkDragDrop<UserColumn[]>): void {
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
