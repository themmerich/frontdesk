import { HttpClient, httpResource } from '@angular/common/http';
import { DestroyRef, Injectable, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { CreateNote, Note } from '../domain/note';

const NOTES_URL = '/api/notes';

/**
 * Reads notes reactively via `httpResource()` and mutates them through
 * `HttpClient`, reloading the resource after each write (guide: resources for
 * reads, HttpClient for mutations).
 */
@Injectable({ providedIn: 'root' })
export class NotesStore {
  private readonly http = inject(HttpClient);
  private readonly destroyRef = inject(DestroyRef);

  private readonly notesResource = httpResource<Note[]>(() => NOTES_URL, { defaultValue: [] });

  readonly notes = this.notesResource.value;
  readonly isLoading = this.notesResource.isLoading;
  readonly hasError = this.notesResource.error;

  create(note: CreateNote): void {
    this.http
      .post<Note>(NOTES_URL, note)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.notesResource.reload());
  }

  remove(id: number): void {
    this.http
      .delete<void>(`${NOTES_URL}/${id}`)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.notesResource.reload());
  }
}
