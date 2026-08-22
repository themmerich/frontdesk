import { Component, inject, linkedSignal, signal } from '@angular/core';
import { form, FormField, max, min, required, submit } from '@angular/forms/signals';
import { TranslocoDirective } from '@jsverse/transloco';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { FormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';

import { MailSettingsStore } from '../data/mail-settings-store';
import { GREENMAIL_DEFAULTS, MailSettings, MailSettingsMode } from '../model/mail-settings';

type ConnectionFormModel = {
  imapHost: string;
  imapPort: number;
  smtpHost: string;
  smtpPort: number;
  username: string;
  /** Empty means: keep the stored password. */
  password: string;
  folder: string;
};

function toFormModel(settings: MailSettings | undefined): ConnectionFormModel {
  return {
    imapHost: settings?.imapHost ?? '',
    imapPort: settings?.imapPort ?? 993,
    smtpHost: settings?.smtpHost ?? '',
    smtpPort: settings?.smtpPort ?? 587,
    username: settings?.username ?? '',
    password: '',
    folder: settings?.folder ?? 'INBOX',
  };
}

/** Mail settings of the signed-in admin's tenant: GreenMail dev mode or a custom IMAP/SMTP server. */
@Component({
  selector: 'app-settings-page',
  imports: [FormField, FormsModule, TranslocoDirective, ButtonModule, CheckboxModule, InputTextModule, MessageModule],
  templateUrl: './settings-page.html',
})
export class SettingsPage {
  protected readonly store = inject(MailSettingsStore);

  protected readonly greenMailDefaults = GREENMAIL_DEFAULTS;

  // Every piece of state re-anchors on the loaded (or freshly saved) settings,
  // while staying freely editable in between.
  protected readonly mode = linkedSignal<MailSettingsMode>(() => this.store.settings.value()?.mode ?? 'GREENMAIL');
  protected readonly isPollingEnabled = linkedSignal(() => this.store.settings.value()?.pollingEnabled ?? true);
  protected readonly isImapTls = linkedSignal(() => this.store.settings.value()?.imapTls ?? true);
  protected readonly isSmtpTls = linkedSignal(() => this.store.settings.value()?.smtpTls ?? true);
  protected readonly connection = linkedSignal(() => toFormModel(this.store.settings.value()));

  protected readonly connectionForm = form(this.connection, (schemaPath) => {
    required(schemaPath.imapHost);
    min(schemaPath.imapPort, 1);
    max(schemaPath.imapPort, 65_535);
    required(schemaPath.smtpHost);
    min(schemaPath.smtpPort, 1);
    max(schemaPath.smtpPort, 65_535);
    required(schemaPath.username);
    required(schemaPath.folder);
  });

  protected readonly saveState = signal<'idle' | 'saving' | 'saved' | 'error'>('idle');
  // Validation errors stay hidden until the field was visited or a save was
  // attempted — submit() alone does not flip the fields' touched state.
  protected readonly hasSubmitAttempted = signal(false);

  protected async onSave(event: Event): Promise<void> {
    event.preventDefault();
    if (this.mode() === 'GREENMAIL') {
      // The connection form is ignored in GreenMail mode, so it must not block saving.
      await this.persist();
      return;
    }
    this.hasSubmitAttempted.set(true);
    await submit(this.connectionForm, async () => {
      await this.persist();
    });
  }

  private async persist(): Promise<void> {
    this.saveState.set('saving');
    try {
      await this.store.save({
        mode: this.mode(),
        ...this.connection(),
        imapTls: this.isImapTls(),
        smtpTls: this.isSmtpTls(),
        pollingEnabled: this.isPollingEnabled(),
      });
      this.hasSubmitAttempted.set(false);
      this.saveState.set('saved');
    } catch {
      this.saveState.set('error');
    }
  }
}
