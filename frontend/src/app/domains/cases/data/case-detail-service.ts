import { HttpClient, httpResource } from '@angular/common/http';
import { inject, Service, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { CaseDetail, CaseTier } from '../model/case';

/** The wire shape: receivedAt is an ISO string until it is parsed into a Date. */
type CaseDetailResponse = Omit<CaseDetail, 'receivedAt'> & { receivedAt: string };

@Service()
export class CaseDetailService {
  private readonly http = inject(HttpClient);

  /** Set by the page from the route; the resource follows it. */
  readonly id = signal<string | null>(null);

  readonly detail = httpResource<CaseDetail>(() => (this.id() === null ? undefined : `/api/cases/${this.id()}`), {
    parse: (aCase) => {
      const response = aCase as CaseDetailResponse;
      return { ...response, receivedAt: new Date(response.receivedAt) };
    },
  });

  /**
   * A person overruling the triage: the category and the tier travel together, because the page
   * saves them together and half a correction is worse than none. The answer carries the case as
   * it now stands.
   */
  async changeClassification(categoryId: string | null, tier: CaseTier): Promise<void> {
    const changed = await firstValueFrom(this.http.put<CaseDetailResponse>(`/api/cases/${this.id()}/classification`, { categoryId, tier }));
    this.detail.set({ ...changed, receivedAt: new Date(changed.receivedAt) });
  }
}
