import { HttpClient, httpResource } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { TriageSettings } from '../model/triage-settings';

/** The tenant's triage knobs; the null default keeps every read safe while the resource loads. */
@Service()
export class TriageSettingsService {
  private readonly http = inject(HttpClient);

  readonly settings = httpResource<TriageSettings | null>(() => '/api/triage-settings', { defaultValue: null });

  /** Saves and reflects the server's answer, so the form shows the stored state. */
  async save(settings: TriageSettings): Promise<void> {
    this.settings.set(await firstValueFrom(this.http.put<TriageSettings>('/api/triage-settings', settings)));
  }
}
