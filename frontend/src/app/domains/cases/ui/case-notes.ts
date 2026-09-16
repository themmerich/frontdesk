import { DatePipe } from '@angular/common';
import { Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoDirective } from '@jsverse/transloco';
import { ButtonModule } from 'primeng/button';
import { TextareaModule } from 'primeng/textarea';

import { CaseNote } from '../model/case';

/**
 * What colleagues wrote to each other about a case. Never sent: the draft is what goes to the
 * customer, and a note is not part of it. The panel says so, because somebody who is not sure
 * writes nothing.
 *
 * <p>Only one's own notes can be changed or removed. Correcting what a colleague wrote would make
 * the name above it a lie, and the name is the point of writing it down.
 */
@Component({
  selector: 'app-case-notes',
  imports: [DatePipe, FormsModule, TranslocoDirective, ButtonModule, TextareaModule],
  templateUrl: './case-notes.html',
})
export class CaseNotes {
  readonly notes = input<CaseNote[]>([]);

  /** While a note is on its way, so a second press cannot send it twice. */
  readonly busy = input(false);

  readonly added = output<string>();
  readonly edited = output<{ id: string; text: string }>();
  readonly removed = output<CaseNote>();

  /** What is being typed for a new note; empty again once it is away. */
  protected readonly draft = signal('');

  /** The note being rewritten, if any, and the text as it stands in the box. */
  protected readonly editingId = signal<string | null>(null);
  protected readonly editingText = signal('');

  protected readonly canAdd = computed(() => this.draft().trim().length > 0 && !this.busy());
  protected readonly canSaveEdit = computed(() => this.editingText().trim().length > 0 && !this.busy());

  protected onAdd(): void {
    if (!this.canAdd()) {
      return;
    }
    this.added.emit(this.draft().trim());
    this.draft.set('');
  }

  protected onStartEdit(note: CaseNote): void {
    this.editingId.set(note.id);
    this.editingText.set(note.text);
  }

  protected onCancelEdit(): void {
    this.editingId.set(null);
    this.editingText.set('');
  }

  protected onSaveEdit(): void {
    const id = this.editingId();
    if (id === null || !this.canSaveEdit()) {
      return;
    }
    this.edited.emit({ id, text: this.editingText().trim() });
    this.onCancelEdit();
  }
}
