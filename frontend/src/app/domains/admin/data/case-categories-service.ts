import { HttpClient, httpResource } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { CaseCategory, CaseCategoryUpdate } from '../model/case-category';

/**
 * The categories the triage sorts the tenant's mail into. Every change reloads the list, so the
 * page shows what the backend stored rather than what it hoped for.
 */
@Service()
export class CaseCategoriesService {
  private readonly http = inject(HttpClient);

  /** Every category, the inactive ones among them, in the order the prompt lists them. */
  readonly categories = httpResource<CaseCategory[]>(() => '/api/case-categories', { defaultValue: [] });

  async create(category: CaseCategoryUpdate): Promise<void> {
    await firstValueFrom(this.http.post<CaseCategory>('/api/case-categories', category));
    this.categories.reload();
  }

  async update(id: string, category: CaseCategoryUpdate): Promise<void> {
    await firstValueFrom(this.http.put<CaseCategory>(`/api/case-categories/${id}`, category));
    this.categories.reload();
  }

  async remove(id: string): Promise<void> {
    await firstValueFrom(this.http.delete<void>(`/api/case-categories/${id}`));
    this.categories.reload();
  }
}
