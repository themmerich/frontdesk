import { DOCUMENT } from '@angular/common';
import { HttpClient, httpResource } from '@angular/common/http';
import { DestroyRef, inject, Service } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { Case } from '../model/case';

/** The wire shape: receivedAt is an ISO string until it is parsed into a Date. */
type CaseResponse = Omit<Case, 'receivedAt'> & { receivedAt: string };

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
    parse: (cases) => (cases as CaseResponse[]).map((item) => ({ ...item, receivedAt: new Date(item.receivedAt) })),
  });

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
   * Deletes a selection for good and reloads, so the list shows what is left rather than what the
   * client believes is left. One request for the whole selection: a row action is a selection of
   * one, and half a deletion is worse than none.
   */
  async remove(ids: string[]): Promise<void> {
    await firstValueFrom(this.http.delete<void>('/api/cases', { body: { ids } }));
    this.cases.reload();
  }

  private reloadWhenVisible(): void {
    if (this.document.visibilityState === 'visible') {
      this.cases.reload();
    }
  }
}
