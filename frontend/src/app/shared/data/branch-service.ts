import { HttpClient, httpResource } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { Branch, BranchUpdate } from '../model/branch';

/**
 * The sites of the signed-in user's company: the profile page (core) offers
 * them as a dropdown, the admin's company page manages the branches — Sheriff
 * allows both sides only this shared meeting point. The empty default keeps
 * every read safe while the resource loads or errors.
 */
@Service()
export class BranchService {
  private readonly http = inject(HttpClient);

  /** The headquarters first, then the branches alphabetically — the backend's order. */
  readonly branches = httpResource<Branch[]>(() => '/api/branches', { defaultValue: [] });

  async create(update: BranchUpdate): Promise<void> {
    await firstValueFrom(this.http.post<Branch>('/api/branches', update));
    this.branches.reload();
  }

  async update(id: string, update: BranchUpdate): Promise<void> {
    await firstValueFrom(this.http.put<Branch>(`/api/branches/${id}`, update));
    this.branches.reload();
  }

  async remove(id: string): Promise<void> {
    await firstValueFrom(this.http.delete<void>(`/api/branches/${id}`));
    this.branches.reload();
  }
}
