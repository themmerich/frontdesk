import { Component, computed, inject, signal } from '@angular/core';
import { ChildFieldContext, form, FormField, pattern, required, submit } from '@angular/forms/signals';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { FieldsetModule } from 'primeng/fieldset';
import { FloatLabelModule } from 'primeng/floatlabel';
import { InputGroupModule } from 'primeng/inputgroup';
import { InputGroupAddonModule } from 'primeng/inputgroupaddon';
import { MessageModule } from 'primeng/message';
import { PasswordModule } from 'primeng/password';

import { AiSettingsService } from '../data/ai-settings-service';

/**
 * Anthropic hands out keys as `sk-ant-…`. The check is deliberately loose: it catches a pasted
 * mail address or a line that lost its tail, and leaves whether the key actually works to the
 * provider — which is what the test button is for. Surrounding whitespace is tolerated rather
 * than rejected: a key arrives here by copy and paste, and the trailing newline is not the
 * admin's mistake.
 */
const API_KEY_SHAPE = /^\s*sk-ant-[A-Za-z0-9_-]+\s*$/;

/**
 * Where a tenant puts its own Anthropic key. Without one it runs on the platform's credentials,
 * which is where every tenant starts; with one, its own account is billed.
 */
@Component({
  selector: 'app-ai-settings-page',
  imports: [
    FormField,
    TranslocoDirective,
    ButtonModule,
    FieldsetModule,
    FloatLabelModule,
    InputGroupModule,
    InputGroupAddonModule,
    MessageModule,
    PasswordModule,
  ],
  templateUrl: './ai-settings-page.html',
})
export class AiSettingsPage {
  protected readonly aiSettingsService = inject(AiSettingsService);
  private readonly messageService = inject(MessageService);
  private readonly transloco = inject(TranslocoService);

  protected readonly isSaving = signal(false);
  protected readonly isTesting = signal(false);
  protected readonly isClearing = signal(false);
  // A save attempt judges the field at once — submit() alone does not flip its
  // touched state.
  private readonly hasSubmitAttempted = signal(false);

  protected readonly hasOwnKey = computed(() => this.aiSettingsService.settings.value()?.ownKey === true);

  // PrimeNG paints an invalid field red the moment it is bound, so the key is
  // only judged once it was typed into or a save was attempted.
  private readonly whenEdited = ({ state }: ChildFieldContext<string>) => state.dirty() || this.hasSubmitAttempted();

  // The stored key never comes back, so the field always starts empty: what it
  // holds is a new key, never the current one.
  protected readonly model = signal({ apiKey: '' });
  protected readonly form = form(this.model, (schemaPath) => {
    required(schemaPath.apiKey, { when: this.whenEdited });
    pattern(schemaPath.apiKey, API_KEY_SHAPE, { when: this.whenEdited });
  });

  protected async onSave(event: Event): Promise<void> {
    event.preventDefault();
    this.hasSubmitAttempted.set(true);
    await submit(this.form, async () => {
      this.isSaving.set(true);
      try {
        await this.aiSettingsService.save(this.model().apiKey.trim());
        this.model.set({ apiKey: '' });
        this.form().reset();
        this.hasSubmitAttempted.set(false);
        this.toast('success', 'aiSettings.saved');
      } catch {
        this.toast('error', 'aiSettings.error');
      } finally {
        this.isSaving.set(false);
      }
    });
  }

  protected async onTest(): Promise<void> {
    if (this.form.apiKey().invalid() || this.model().apiKey.trim() === '') {
      this.hasSubmitAttempted.set(true);
      return;
    }
    this.isTesting.set(true);
    try {
      const result = await this.aiSettingsService.test(this.model().apiKey.trim());
      if (result.success) {
        this.toast('success', 'aiSettings.testSuccess');
      } else {
        this.messageService.add({
          severity: 'warn',
          summary: this.transloco.translate('aiSettings.testFailed'),
          detail: result.message,
          // The provider's reason takes a moment to read.
          life: 8000,
        });
      }
    } catch {
      this.toast('error', 'aiSettings.error');
    } finally {
      this.isTesting.set(false);
    }
  }

  protected async onClear(): Promise<void> {
    this.isClearing.set(true);
    try {
      await this.aiSettingsService.clear();
      this.toast('success', 'aiSettings.removed');
    } catch {
      this.toast('error', 'aiSettings.error');
    } finally {
      this.isClearing.set(false);
    }
  }

  private toast(severity: 'success' | 'error', translationKey: string): void {
    this.messageService.add({ severity, summary: this.transloco.translate(translationKey) });
  }
}
