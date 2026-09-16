import { HttpClient, httpResource } from '@angular/common/http';
import { inject, Service, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { CaseNote } from '../model/case';

/** The wire shape: the moments are ISO strings until they are parsed into Dates. */
type CaseNoteResponse = Omit<CaseNote, 'createdAt' | 'updatedAt'> & { createdAt: string; updatedAt?: string | null };

function parseMoments(note: CaseNoteResponse): CaseNote {
  return { ...note, createdAt: new Date(note.createdAt), updatedAt: note.updatedAt ? new Date(note.updatedAt) : null };
}

/**
 * What colleagues wrote to each other about one case. A read of its own rather than part of the
 * case: notes change while the case does not, and reloading them must not redraw the mail.
 */
@Service()
export class CaseNotesService {
  private readonly http = inject(HttpClient);

  /** Set by the page from the route; the resource follows it. */
  readonly caseId = signal<string | null>(null);

  readonly notes = httpResource<CaseNote[]>(() => (this.caseId() === null ? undefined : `/api/cases/${this.caseId()}/notes`), {
    defaultValue: [],
    parse: (notes) => (notes as CaseNoteResponse[]).map(parseMoments),
  });

  async add(text: string): Promise<void> {
    await firstValueFrom(this.http.post<unknown>(`/api/cases/${this.caseId()}/notes`, { text }));
    this.notes.reload();
  }

  async edit(noteId: string, text: string): Promise<void> {
    await firstValueFrom(this.http.put<unknown>(`/api/cases/${this.caseId()}/notes/${noteId}`, { text }));
    this.notes.reload();
  }

  async remove(noteId: string): Promise<void> {
    await firstValueFrom(this.http.delete<void>(`/api/cases/${this.caseId()}/notes/${noteId}`));
    this.notes.reload();
  }
}
