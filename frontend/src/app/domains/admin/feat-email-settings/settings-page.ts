import { Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { applyWhen, form, FormField, max, min, required, submit } from '@angular/forms/signals';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { FieldsetModule } from 'primeng/fieldset';
import { FloatLabelModule } from 'primeng/floatlabel';
import { InputGroupModule } from 'primeng/inputgroup';
import { InputGroupAddonModule } from 'primeng/inputgroupaddon';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectButtonModule } from 'primeng/selectbutton';

import { MailSettingsService } from '../data/mail-settings-service';
import { GREENMAIL_DEFAULTS, MAIL_PROVIDER_PRESETS, MailProviderPreset, MailSettings, MailSettingsMode } from '../model/mail-settings';

type MailSettingsFormModel = {
  mode: MailSettingsMode;
  imapHost: string;
  imapPort: number;
  imapTls: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpTls: boolean;
  username: string;
  /** Empty means: keep the stored password. */
  password: string;
  folder: string;
  pollingEnabled: boolean;
};

function toFormModel(settings: MailSettings | undefined): MailSettingsFormModel {
  if (settings === undefined) {
    return {
      mode: 'GREENMAIL',
      imapHost: '',
      imapPort: 993,
      imapTls: true,
      smtpHost: '',
      smtpPort: 587,
      smtpTls: true,
      username: '',
      password: '',
      folder: 'INBOX',
      pollingEnabled: true,
    };
  }
  return {
    mode: settings.mode,
    imapHost: settings.imapHost,
    imapPort: settings.imapPort,
    imapTls: settings.imapTls,
    smtpHost: settings.smtpHost,
    smtpPort: settings.smtpPort,
    smtpTls: settings.smtpTls,
    username: settings.username,
    password: '',
    folder: settings.folder,
    pollingEnabled: settings.pollingEnabled,
  };
}

/** Mail settings of the signed-in admin's tenant: GreenMail dev mode or a custom IMAP/SMTP server. */
@Component({
  selector: 'app-settings-page',
  imports: [
    FormField,
    TranslocoDirective,
    ButtonModule,
    CheckboxModule,
    FieldsetModule,
    FloatLabelModule,
    InputGroupModule,
    InputGroupAddonModule,
    InputTextModule,
    MessageModule,
    SelectButtonModule,
  ],
  templateUrl: './settings-page.html',
})
export class SettingsPage {
  protected readonly mailSettingsService = inject(MailSettingsService);
  private readonly messageService = inject(MessageService);
  private readonly transloco = inject(TranslocoService);

  protected readonly greenMailDefaults = GREENMAIL_DEFAULTS;
  protected readonly providerPresets = MAIL_PROVIDER_PRESETS;
  /** The last applied preset, so its caveat (e.g. app password) stays visible. */
  protected readonly appliedPreset = signal<MailProviderPreset | null>(null);
  /** Presets write the model programmatically, which the form's dirty flag cannot see. */
  protected readonly hasPendingPreset = signal(false);

  // One model for everything on the page, re-anchoring on the loaded (or
  // freshly saved) settings while staying freely editable in between.
  protected readonly model = linkedSignal(() => toFormModel(this.mailSettingsService.settings.value()));
  protected readonly settingsForm = form(this.model, (schemaPath) => {
    // The connection only matters for a custom server; GreenMail ignores it.
    applyWhen(
      schemaPath,
      ({ valueOf }) => valueOf(schemaPath.mode) === 'CUSTOM',
      (customPath) => {
        required(customPath.imapHost);
        min(customPath.imapPort, 1);
        max(customPath.imapPort, 65_535);
        required(customPath.smtpHost);
        min(customPath.smtpPort, 1);
        max(customPath.smtpPort, 65_535);
        required(customPath.username);
        required(customPath.folder);
      },
    );
  });

  // Re-evaluates the options once the active translation file (re)loads.
  private readonly translation = toSignal(this.transloco.selectTranslation());
  protected readonly modeOptions = computed<{ label: string; value: MailSettingsMode }[]>(() => {
    this.translation();
    return [
      { label: this.transloco.translate('settings.modeGreenmail'), value: 'GREENMAIL' },
      { label: this.transloco.translate('settings.modeCustom'), value: 'CUSTOM' },
    ];
  });

  protected readonly isSaving = signal(false);
  protected readonly isTesting = signal(false);
  // Validation errors stay hidden until the field was visited or a save was
  // attempted — submit() alone does not flip the fields' touched state.
  protected readonly hasSubmitAttempted = signal(false);

  /** Prefills the connection fields; username, password, and folder stay untouched. */
  protected onApplyPreset(preset: MailProviderPreset): void {
    this.model.update((model) => ({
      ...model,
      imapHost: preset.imapHost,
      imapPort: preset.imapPort,
      imapTls: preset.imapTls,
      smtpHost: preset.smtpHost,
      smtpPort: preset.smtpPort,
      smtpTls: preset.smtpTls,
    }));
    this.appliedPreset.set(preset);
    this.hasPendingPreset.set(true);
  }

  /**
   * Probes the mailbox with the form values as they currently stand, without saving. Only the
   * fields the probe actually needs (IMAP, username, folder) have to be valid.
   */
  protected async onTestConnection(): Promise<void> {
    const fieldsForTest = [this.settingsForm.imapHost, this.settingsForm.imapPort, this.settingsForm.username, this.settingsForm.folder];
    if (fieldsForTest.some((field) => field().invalid())) {
      this.hasSubmitAttempted.set(true);
      return;
    }
    this.isTesting.set(true);
    try {
      const result = await this.mailSettingsService.test(this.model());
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
    this.hasSubmitAttempted.set(true);
    // The conditional schema keeps the connection fields valid in GreenMail
    // mode, so submit() never blocks on the hidden form there.
    await submit(this.settingsForm, async () => {
      this.isSaving.set(true);
      try {
        await this.mailSettingsService.save(this.model());
        this.hasSubmitAttempted.set(false);
        this.hasPendingPreset.set(false);
        // Back to pristine: the save button stays disabled until the next edit.
        this.settingsForm().reset();
        this.messageService.add({ severity: 'success', summary: this.transloco.translate('settings.saved') });
      } catch {
        this.messageService.add({ severity: 'error', summary: this.transloco.translate('settings.saveError') });
      } finally {
        this.isSaving.set(false);
      }
    });
  }
}
