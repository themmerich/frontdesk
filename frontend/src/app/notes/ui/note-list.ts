import { Component, input, output } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { ButtonModule } from 'primeng/button';

/** The shape `note-list` needs to render — a presentational contract, domain-free. */
export type NoteListItem = {
  id: number;
  title: string;
  content: string;
};

@Component({
  selector: 'app-note-list',
  imports: [TranslocoDirective, ButtonModule],
  template: `
    <ng-container *transloco="let t">
      <ul class="flex flex-col gap-3">
        @for (note of notes(); track note.id) {
          <li class="flex items-start justify-between gap-4 rounded border border-surface-200 p-3 dark:border-surface-700">
            <div class="flex flex-col gap-1">
              <span class="font-medium">{{ note.title }}</span>
              <span class="text-sm text-surface-600 dark:text-surface-300">{{ note.content }}</span>
            </div>
            <p-button
              type="button"
              icon="pi pi-trash"
              severity="danger"
              [text]="true"
              [ariaLabel]="t('notes.delete')"
              (onClick)="remove.emit(note.id)"
            />
          </li>
        } @empty {
          <li class="text-surface-500">{{ t('notes.empty') }}</li>
        }
      </ul>
    </ng-container>
  `,
})
export class NoteList {
  readonly notes = input.required<NoteListItem[]>();
  readonly remove = output<number>();
}
