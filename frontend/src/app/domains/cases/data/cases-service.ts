import { DOCUMENT } from '@angular/common';
import { HttpClient, httpResource } from '@angular/common/http';
import { computed, DestroyRef, inject, Service } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { Case, CaseTier } from '../model/case';

/** The wire shape: the two moments are ISO strings until they are parsed into Dates. */
type CaseResponse = Omit<Case, 'receivedAt' | 'handledAt'> & { receivedAt: string; handledAt?: string | null };

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
      })),
  });

  /**
   * What is still to be worked through, and what has been. One request answers both: the backend
   * hands over the tenant's cases, and whether somebody has taken note of one is a field on it.
   *
   * <p>The inbox shows the open ones and the archive the rest, so nothing is in both places and
   * nothing falls between them. Both read through the guard, because value() throws while the
   * resource is in the error state.
   */
  readonly openCases = computed(() => this.loaded().filter((aCase) => aCase.handledAt === null));
  readonly archivedCases = computed(() => this.loaded().filter((aCase) => aCase.handledAt !== null));

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
   * Deletes a selection for good and reloads, so the list shows what is left rather than what the
   * client believes is left. One request for the whole selection: a row action is a selection of
   * one, and half a deletion is worse than none.
   */
  async remove(ids: string[]): Promise<void> {
    await firstValueFrom(this.http.delete<void>('/api/cases', { body: { ids } }));
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
