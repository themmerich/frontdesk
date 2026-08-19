import { Component, output, signal } from '@angular/core';
import { FormField, form, maxLength, required } from '@angular/forms/signals';
import { TranslocoDirective } from '@jsverse/transloco';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';

/** What the form emits on submit — a presentational contract, domain-free. */
export type NoteDraft = {
  title: string;
  content: string;
};

@Component({
  selector: 'app-note-form',
  imports: [FormField, TranslocoDirective, ButtonModule, InputTextModule, TextareaModule],
  template: `
    <ng-container *transloco="let t">
      <form class="flex flex-col gap-4" (submit)="onSubmit($event)">
        <div class="flex flex-col gap-2">
          <label for="note-title" class="font-medium">{{ t('notes.titleLabel') }}</label>
          <input pInputText id="note-title" [formField]="noteForm.title" [placeholder]="t('notes.titlePlaceholder')" class="w-full" />
          @if (noteForm.title().invalid() && noteForm.title().touched()) {
            <small class="text-red-500">{{ t('notes.required') }}</small>
          }
        </div>

        <div class="flex flex-col gap-2">
          <label for="note-content" class="font-medium">{{ t('notes.contentLabel') }}</label>
          <textarea
            pTextarea
            id="note-content"
            [formField]="noteForm.content"
            rows="3"
            [placeholder]="t('notes.contentPlaceholder')"
            class="w-full"
          ></textarea>
          @if (noteForm.content().invalid() && noteForm.content().touched()) {
            <small class="text-red-500">{{ t('notes.required') }}</small>
          }
        </div>

        <p-button type="submit" [label]="t('notes.add')" icon="pi pi-plus" [disabled]="noteForm().invalid()" />
      </form>
    </ng-container>
  `,
})
export class NoteForm {
  readonly save = output<NoteDraft>();

  protected readonly model = signal<NoteDraft>({ title: '', content: '' });
  protected readonly noteForm = form(this.model, (note) => {
    required(note.title);
    maxLength(note.title, 200);
    required(note.content);
  });

  protected onSubmit(event: Event): void {
    event.preventDefault();
    if (this.noteForm().invalid()) {
      this.noteForm().markAsTouched();
      return;
    }
    this.save.emit(this.model());
    this.noteForm().reset();
  }
}
