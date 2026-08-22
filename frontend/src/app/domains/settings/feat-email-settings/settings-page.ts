import { Component, inject, linkedSignal, signal } from '@angular/core';
import { form, FormField, max, min, required, submit } from '@angular/forms/signals';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { FormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';

import { MailSettingsStore } from '../data/mail-settings-store';
import { GREENMAIL_DEFAULTS, MAIL_PROVIDER_PRESETS, MailProviderPreset, MailSettings, MailSettingsMode } from '../model/mail-settings';

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
  private readonly messageService = inject(MessageService);
  private readonly transloco = inject(TranslocoService);

  protected readonly greenMailDefaults = GREENMAIL_DEFAULTS;
  protected readonly providerPresets = MAIL_PROVIDER_PRESETS;
  /** The last applied preset, so its caveat (e.g. app password) stays visible. */
  protected readonly appliedPreset = signal<MailProviderPreset | null>(null);

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

  protected readonly isSaving = signal(false);
  protected readonly isTesting = signal(false);
  // Validation errors stay hidden until the field was visited or a save was
  // attempted — submit() alone does not flip the fields' touched state.
  protected readonly hasSubmitAttempted = signal(false);

  /** Prefills the connection fields; username, password, and folder stay untouched. */
  protected onApplyPreset(preset: MailProviderPreset): void {
    this.connection.update((connection) => ({
      ...connection,
      imapHost: preset.imapHost,
      imapPort: preset.imapPort,
      smtpHost: preset.smtpHost,
      smtpPort: preset.smtpPort,
    }));
    this.isImapTls.set(preset.imapTls);
    this.isSmtpTls.set(preset.smtpTls);
    this.appliedPreset.set(preset);
  }

  /**
   * Probes the mailbox with the form values as they currently stand, without saving. Only the
   * fields the probe actually needs (IMAP, username, folder) have to be valid.
   */
  protected async onTestConnection(): Promise<void> {
    const fieldsForTest = [
      this.connectionForm.imapHost,
      this.connectionForm.imapPort,
      this.connectionForm.username,
      this.connectionForm.folder,
    ];
    if (fieldsForTest.some((field) => field().invalid())) {
      this.hasSubmitAttempted.set(true);
      return;
    }
    this.isTesting.set(true);
    try {
      const result = await this.store.test({
        mode: this.mode(),
        ...this.connection(),
        imapTls: this.isImapTls(),
        smtpTls: this.isSmtpTls(),
        pollingEnabled: this.isPollingEnabled(),
      });
      if (result.success) {
        this.messageService.add({ severity: 'success', summary: this.transloco.translate('settings.testSuccess') });
      } else {
        this.messageService.add({
          severity: 'warn',
          summary: this.transloco.translate('settings.testFailed'),
          detail: result.message,
          // The technical reason takes a moment to read.
          life: 8000,
        });
      }
    } catch {
      this.messageService.add({ severity: 'error', summary: this.transloco.translate('settings.testError') });
    } finally {
      this.isTesting.set(false);
    }
  }

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
    this.isSaving.set(true);
    try {
      await this.store.save({
        mode: this.mode(),
        ...this.connection(),
        imapTls: this.isImapTls(),
        smtpTls: this.isSmtpTls(),
        pollingEnabled: this.isPollingEnabled(),
      });
      this.hasSubmitAttempted.set(false);
      this.messageService.add({ severity: 'success', summary: this.transloco.translate('settings.saved') });
    } catch {
      this.messageService.add({ severity: 'error', summary: this.transloco.translate('settings.saveError') });
    } finally {
      this.isSaving.set(false);
    }
  }
}
