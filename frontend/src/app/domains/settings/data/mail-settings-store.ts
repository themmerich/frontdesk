import { HttpClient, httpResource } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { MailSettings, MailSettingsUpdate } from '../model/mail-settings';

@Service()
export class MailSettingsStore {
  private readonly http = inject(HttpClient);

  readonly settings = httpResource<MailSettings>(() => '/api/settings/mail');

  /** Saves and reflects the server's answer in the resource, so the page shows the stored state. */
  async save(update: MailSettingsUpdate): Promise<void> {
    const saved = await firstValueFrom(this.http.put<MailSettings>('/api/settings/mail', update));
    this.settings.set(saved);
  }
}
