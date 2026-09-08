import { DOCUMENT } from '@angular/common';
import { HttpClient, httpResource } from '@angular/common/http';
import { computed, DestroyRef, inject, Service } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { Case, CaseTier } from '../model/case';

/** The wire shape: the moments are ISO strings until they are parsed into Dates. */
type CaseResponse = Omit<Case, 'receivedAt' | 'handledAt' | 'deletedAt'> & {
  receivedAt: string;
  handledAt?: string | null;
  deletedAt?: string | null;
};

/**
 * How often an open list re-checks for new cases. Matches the backend's mail poll interval:
 * asking more often than mail can arrive only makes requests, not news.
 */
const RELOAD_INTERVAL_MS = 10_000;

@Service()
export class CasesService {
  private readonly document = inject(DOCUMENT);
  private readonly http = inject(HttpClient);

  readonly cases = httpResource<Case[]>(() => '/api/cases', {
    defaultValue: [],
    parse: (cases) =>
      (cases as CaseResponse[]).map((item) => ({
        ...item,
        receivedAt: new Date(item.receivedAt),
        // Anything but a moment means nobody has taken note of the case. Said this way round
        // because new Date(undefined) is an Invalid Date rather than an error, and a case
        // carrying one would silently drop out of the review.
        handledAt: item.handledAt ? new Date(item.handledAt) : null,
        deletedAt: item.deletedAt ? new Date(item.deletedAt) : null,
      })),
  });

  /**
   * The three piles, from one request: what is still to be worked through, what has been, and
   * what somebody threw away. Which one a case is in is decided by two moments on it, so it is
   * in exactly one and none falls between them.
   *
   * <p>Everything that is not in the trash is still there — that is what the dashboard counts,
   * because a mail somebody threw away is not work.
   */
  readonly openCases = computed(() => this.activeCases().filter((aCase) => aCase.handledAt === null));
  readonly archivedCases = computed(() => this.activeCases().filter((aCase) => aCase.handledAt !== null));
  readonly trashedCases = computed(() => this.loaded().filter((aCase) => aCase.deletedAt !== null));
  readonly activeCases = computed(() => this.loaded().filter((aCase) => aCase.deletedAt === null));

  /** Read through the guard: value() throws while the resource is in the error state. */
  private readonly loaded = computed<Case[]>(() => (this.cases.error() ? [] : this.cases.value()));

  constructor() {
    // Mail arrives while the page just sits there, so the list keeps itself
    // current instead of waiting for a reload.
    const reload = () => this.reloadWhenVisible();
    const interval = setInterval(reload, RELOAD_INTERVAL_MS);
    // A hidden tab is not worth a request; returning to one is worth an
    // immediate refresh rather than up to ten seconds of stale rows.
    this.document.addEventListener('visibilitychange', reload);
    inject(DestroyRef).onDestroy(() => {
      clearInterval(interval);
      this.document.removeEventListener('visibilitychange', reload);
    });
  }

  /**
   * Throws a selection away: into the trash, not out of the world. One request for the whole
   * selection — a row action is a selection of one, and half a deletion is worse than none. The
   * list reloads afterwards, so it shows what is where rather than what the client believes.
   */
  async remove(ids: string[]): Promise<void> {
    await firstValueFrom(this.http.delete<void>('/api/cases', { body: { ids } }));
    this.cases.reload();
  }

  /** Back out of the trash, to where the case was: the archive if it was worked through. */
  async restore(ids: string[]): Promise<void> {
    await firstValueFrom(this.http.put<void>('/api/cases/restore', { ids }));
    this.cases.reload();
  }

  /** Out of the world. Only from the trash, and only after the question that says as much. */
  async purge(ids: string[]): Promise<void> {
    await firstValueFrom(this.http.delete<void>('/api/cases/purge', { body: { ids } }));
    this.cases.reload();
  }

  /**
   * A person filing a case from the row it stands in. Both values travel, as they do from the
   * detail page — the same endpoint, and half a correction is no better here. The list reloads
   * afterwards, so what it shows is what the backend now holds rather than what was hoped for.
   */
  async changeClassification(id: string, categoryId: string | null, tier: CaseTier | null): Promise<void> {
    await firstValueFrom(this.http.put<unknown>(`/api/cases/${id}/classification`, { categoryId, tier }));
    this.cases.reload();
  }

  /**
   * A person taking note of a case, or taking that back. Both directions through the same call,
   * so a click one line too far down is undone by the same click. The list reloads afterwards:
   * what the review shows is then what the backend holds rather than what was hoped for.
   */
  async markHandled(id: string, handled: boolean): Promise<void> {
    await firstValueFrom(this.http.put<unknown>(`/api/cases/${id}/handled`, { handled }));
    this.cases.reload();
  }

  private reloadWhenVisible(): void {
    if (this.document.visibilityState === 'visible') {
      this.cases.reload();
    }
  }
}
