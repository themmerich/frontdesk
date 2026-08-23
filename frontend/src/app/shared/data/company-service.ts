import { HttpClient, httpResource } from '@angular/common/http';
import { computed, inject, Service, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { Company, CompanyUpdate } from '../model/company';

/**
 * The single source of truth for the company: the sidebar (core) reads name
 * and logo from here, the admin's company page writes through it — Sheriff
 * allows both sides only this shared meeting point. The null default keeps
 * every read safe while the resource loads or errors; consumers fall back.
 */
@Service()
export class CompanyService {
  private readonly http = inject(HttpClient);

  readonly company = httpResource<Company | null>(() => '/api/company', { defaultValue: null });

  // Bumped after logo changes, so <img> caches never show a stale picture.
  private readonly logoVersion = signal(0);

  readonly name = computed(() => this.company.value()?.name);
  /** URL of the company logo, or null when there is none. */
  readonly logoUrl = computed(() => (this.company.value()?.hasLogo ? `/api/company/logo?v=${this.logoVersion()}` : null));
  /** The logo URL only when it should fill the whole brand area (replacing the name), else null. */
  readonly largeLogoUrl = computed(() => (this.company.value()?.logoDisplay === 'LOGO_ONLY' ? this.logoUrl() : null));
  /** The tenant's brand color (hex), the app's default primary color; null while unset. */
  readonly primaryColor = computed(() => this.company.value()?.primaryColor ?? null);

  /** Saves and reflects the server's answer in the resource, so every consumer shows the stored state. */
  async save(update: CompanyUpdate): Promise<void> {
    const saved = await firstValueFrom(this.http.put<Company>('/api/company', update));
    this.company.set(saved);
  }

  async uploadLogo(file: File): Promise<void> {
    const formData = new FormData();
    formData.append('file', file);
    await firstValueFrom(this.http.put<void>('/api/company/logo', formData));
    this.company.update((company) => (company ? { ...company, hasLogo: true } : company));
    this.logoVersion.update((version) => version + 1);
  }

  async removeLogo(): Promise<void> {
    await firstValueFrom(this.http.delete<void>('/api/company/logo'));
    this.company.update((company) => (company ? { ...company, hasLogo: false } : company));
  }
}
