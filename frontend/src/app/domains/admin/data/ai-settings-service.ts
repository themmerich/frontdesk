import { HttpClient, httpResource } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { AiSettings, ApiKeyTestResult } from '../model/ai-settings';

@Service()
export class AiSettingsService {
  private readonly http = inject(HttpClient);

  readonly settings = httpResource<AiSettings>(() => '/api/settings/ai');

  /** Stores the key and reflects the server's answer, so the page shows the stored state. */
  async save(apiKey: string): Promise<void> {
    const saved = await firstValueFrom(this.http.put<AiSettings>('/api/settings/ai', { apiKey }));
    this.settings.set(saved);
  }

  /** Back to the platform's credentials. */
  async clear(): Promise<void> {
    await firstValueFrom(this.http.delete<void>('/api/settings/ai'));
    this.settings.set({ ownKey: false });
  }

  /** Tries the key from the form, deliberately not the stored one, so it can be checked before saving. */
  test(apiKey: string): Promise<ApiKeyTestResult> {
    return firstValueFrom(this.http.post<ApiKeyTestResult>('/api/settings/ai/test', { apiKey }));
  }
}
