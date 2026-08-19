import { Component, inject } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { CardModule } from 'primeng/card';
import { ProgressSpinnerModule } from 'primeng/progressspinner';

import { NotesStore } from '../data-access/notes-store';
import { NoteForm } from '../ui/note-form';
import { NoteList } from '../ui/note-list';

@Component({
  selector: 'app-notes-page',
  imports: [TranslocoDirective, CardModule, ProgressSpinnerModule, NoteForm, NoteList],
  template: `
    <main class="mx-auto flex min-h-dvh max-w-xl flex-col gap-6 p-6">
      <ng-container *transloco="let t">
        <p-card [header]="t('notes.title')">
          <div class="flex flex-col gap-6">
            <app-note-form (save)="store.create($event)" />

            @if (store.isLoading()) {
              <p-progress-spinner [style]="{ width: '2rem', height: '2rem' }" [ariaLabel]="t('notes.title')" />
            } @else if (store.hasError()) {
              <p class="text-red-500">{{ t('notes.loadError') }}</p>
            } @else {
              <app-note-list [notes]="store.notes()" (remove)="store.remove($event)" />
            }
          </div>
        </p-card>
      </ng-container>
    </main>
  `,
})
export class NotesPage {
  protected readonly store = inject(NotesStore);
}
