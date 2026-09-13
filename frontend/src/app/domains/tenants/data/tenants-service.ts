import { HttpClient, httpResource } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { Tenant, TenantInput } from '../model/tenant';

/** The wire shape: createdAt is an ISO string until it is parsed into a Date. */
type TenantResponse = Omit<Tenant, 'createdAt'> & { createdAt: string };

function toTenant(response: TenantResponse): Tenant {
  return { ...response, createdAt: new Date(response.createdAt) };
}

/**
 * The tenants, for the super-user. Every change reloads the list, so the row shows what the
 * backend holds — and a 409 for a taken Kennung travels up to the page as the HttpErrorResponse
 * it is, with `error.reason === 'slug'` in its body.
 */
@Service()
export class TenantsService {
  private readonly http = inject(HttpClient);

  readonly tenants = httpResource<Tenant[]>(() => '/api/tenants', {
    defaultValue: [],
    parse: (tenants) => (tenants as TenantResponse[]).map(toTenant),
  });

  async create(tenant: TenantInput): Promise<void> {
    await firstValueFrom(this.http.post<TenantResponse>('/api/tenants', tenant));
    this.tenants.reload();
  }

  async update(id: string, tenant: TenantInput): Promise<void> {
    await firstValueFrom(this.http.put<TenantResponse>(`/api/tenants/${id}`, tenant));
    this.tenants.reload();
  }

  async remove(id: string): Promise<void> {
    await firstValueFrom(this.http.delete<void>(`/api/tenants/${id}`));
    this.tenants.reload();
  }
}
