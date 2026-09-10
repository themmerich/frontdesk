import { HttpClient, httpResource } from '@angular/common/http';
import { inject, Service, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { CaseDetail, CaseTier } from '../model/case';

/** The wire shape: the moments are ISO strings until they are parsed into Dates. */
type CaseDetailResponse = Omit<
  CaseDetail,
  'receivedAt' | 'handledAt' | 'deletedAt' | 'draftText' | 'draftGeneratedAt' | 'draftUpdatedAt'
> & {
  receivedAt: string;
  handledAt?: string | null;
  deletedAt?: string | null;
  draftText?: string | null;
  draftGeneratedAt?: string | null;
  draftUpdatedAt?: string | null;
};

/** The moments a case carries, as Dates. Anything but a moment means it never happened. */
function parseMoments(response: CaseDetailResponse): CaseDetail {
  return {
    ...response,
    receivedAt: new Date(response.receivedAt),
    handledAt: response.handledAt ? new Date(response.handledAt) : null,
    deletedAt: response.deletedAt ? new Date(response.deletedAt) : null,
    // An answer without the draft fields at all is a case without a draft, not one with an
    // undefined one — the page asks "is there a text" and wants a plain no.
    draftText: response.draftText ?? null,
    draftGeneratedAt: response.draftGeneratedAt ? new Date(response.draftGeneratedAt) : null,
    draftUpdatedAt: response.draftUpdatedAt ? new Date(response.draftUpdatedAt) : null,
  };
}

@Service()
export class CaseDetailService {
  private readonly http = inject(HttpClient);

  /** Set by the page from the route; the resource follows it. */
  readonly id = signal<string | null>(null);

  readonly detail = httpResource<CaseDetail>(() => (this.id() === null ? undefined : `/api/cases/${this.id()}`), {
    parse: (aCase) => parseMoments(aCase as CaseDetailResponse),
  });

  /**
   * A person overruling the triage: the category and the tier travel together, because the page
   * saves them together and half a correction is worse than none. The answer carries the case as
   * it now stands.
   */
  async changeClassification(categoryId: string | null, tier: CaseTier | null): Promise<void> {
    const changed = await firstValueFrom(this.http.put<CaseDetailResponse>(`/api/cases/${this.id()}/classification`, { categoryId, tier }));
    this.detail.set(parseMoments(changed));
  }

  /**
   * The model writes the reply now, in place of whatever draft there was. Takes as long as the
   * model takes; the page shows that it is waiting.
   */
  async generateDraft(): Promise<void> {
    const drafted = await firstValueFrom(this.http.post<CaseDetailResponse>(`/api/cases/${this.id()}/draft`, {}));
    this.detail.set(parseMoments(drafted));
  }

  /** The reply as a person left it. What the model wrote stays beside it, on the server. */
  async saveDraft(text: string): Promise<void> {
    const saved = await firstValueFrom(this.http.put<CaseDetailResponse>(`/api/cases/${this.id()}/draft`, { text }));
    this.detail.set(parseMoments(saved));
  }
}
