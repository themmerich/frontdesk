import { DOCUMENT } from '@angular/common';
import { HttpClient, httpResource } from '@angular/common/http';
import { computed, effect, inject, InjectionToken, Service, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { Company, CompanyUpdate, isCompany } from '../model/company';

const STORAGE_KEY = 'frontdesk-company';

/**
 * The storage the brand is remembered in. Injectable like the other two in this app: depending
 * on Node version and jsdom, neither the global nor the jsdom window reliably offers a working
 * localStorage in unit tests.
 */
export const COMPANY_STORAGE = new InjectionToken<Storage | null>('COMPANY_STORAGE', {
  providedIn: 'root',
  factory: () => inject(DOCUMENT).defaultView?.localStorage ?? null,
});

/**
 * The single source of truth for the company: the sidebar (core) reads name
 * and logo from here, the admin's company page writes through it — Sheriff
 * allows both sides only this shared meeting point. The null default keeps
 * every read safe while the resource loads or errors; consumers fall back.
 */
@Service()
export class CompanyService {
  private readonly http = inject(HttpClient);
  private readonly storage = inject(COMPANY_STORAGE);

  /**
   * The company, starting from the one this browser saw last. Without that, a reload paints the
   * app's own brand first — the frontdesk logo in the preset's colours — and swaps it for the
   * tenant's a moment later, when the request comes back. The remembered answer is a guess about
   * a company that rarely changes; the real one replaces it as soon as it arrives.
   */
  readonly company = httpResource<Company | null>(() => '/api/company', { defaultValue: this.remembered() });

  constructor() {
    // Every answer is remembered, not only the first: a company that renames itself, picks
    // another colour or drops its logo is remembered as it now is. Saving through this service
    // goes the same way, because it puts the server's answer into the resource.
    effect(() => {
      const company = this.company.value();
      if (company !== null) {
        this.storage?.setItem(STORAGE_KEY, JSON.stringify(company));
      }
    });
  }

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

  /**
   * Forgets the remembered brand. Said on signing out: the next person at this browser may
   * belong to another company, and would otherwise be greeted by this one's name and colour
   * for as long as their own takes to arrive.
   */
  forget(): void {
    this.storage?.removeItem(STORAGE_KEY);
  }

  /** What was remembered, if it is still a company — a half-written entry is worth nothing. */
  private remembered(): Company | null {
    const stored = this.storage?.getItem(STORAGE_KEY) ?? null;
    if (stored === null) {
      return null;
    }
    try {
      const parsed: unknown = JSON.parse(stored);
      return isCompany(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
}
