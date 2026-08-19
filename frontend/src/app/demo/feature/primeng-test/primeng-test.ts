import { Component, inject, signal } from '@angular/core';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';

@Component({
  selector: 'app-primeng-test',
  imports: [TranslocoDirective, ButtonModule, CardModule, InputTextModule, TagModule, ToastModule],
  providers: [MessageService],
  template: `
    <p-toast />
    <main class="flex min-h-dvh items-center justify-center p-6">
      <ng-container *transloco="let t">
        <p-card [header]="t('title')" class="w-full max-w-xl">
          <div class="flex flex-col gap-6">
            <p class="text-surface-600 dark:text-surface-300">{{ t('description') }}</p>

            <div class="flex flex-col gap-2">
              <label for="name" class="font-medium">{{ t('nameLabel') }}</label>
              <input
                pInputText
                id="name"
                #nameInput
                [value]="name()"
                (input)="name.set(nameInput.value)"
                [placeholder]="t('namePlaceholder')"
                class="w-full"
              />
              <span class="text-sm text-surface-500">{{ t('greeting', { name: name() || t('stranger') }) }}</span>
            </div>

            <div class="flex flex-wrap items-center gap-3">
              <p-button [label]="t('showToast')" icon="pi pi-check" (onClick)="greet()" />
              <p-tag [value]="'Clicks: ' + clicks()" severity="info" />
            </div>

            <div class="flex items-center gap-2">
              <span class="font-medium">{{ t('language') }}:</span>
              @for (lang of langs; track lang) {
                <p-button [label]="lang.toUpperCase()" size="small" [outlined]="activeLang() !== lang" (onClick)="switchLang(lang)" />
              }
            </div>
          </div>
        </p-card>
      </ng-container>
    </main>
  `,
})
export class PrimeNgTest {
  private readonly messages = inject(MessageService);
  private readonly transloco = inject(TranslocoService);

  protected readonly name = signal('');
  protected readonly clicks = signal(0);
  protected readonly langs = ['en', 'de'];
  protected readonly activeLang = signal(this.transloco.getActiveLang());

  protected switchLang(lang: string): void {
    this.transloco.setActiveLang(lang);
    this.activeLang.set(lang);
  }

  protected greet(): void {
    this.clicks.update((count) => count + 1);
    const name = this.name() || this.transloco.translate('stranger');
    this.messages.add({
      severity: 'success',
      summary: this.transloco.translate('toastSummary'),
      detail: this.transloco.translate('toastDetail', { name, count: this.clicks() }),
    });
  }
}
