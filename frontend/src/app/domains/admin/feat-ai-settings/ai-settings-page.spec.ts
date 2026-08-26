import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { MessageService, ToastMessageOptions } from 'primeng/api';

import { AiSettingsService } from '../data/ai-settings-service';
import { AiSettings, ApiKeyTestResult } from '../model/ai-settings';
import { AiSettingsPage } from './ai-settings-page';

const translations = {
  aiSettings: {
    title: 'AI access',
    intro: 'By default the classification runs on frontdesk’s own access.',
    legend: 'Anthropic key',
    statePlatform: "This tenant uses frontdesk's access.",
    stateOwn: 'This tenant uses its own key.',
    apiKey: 'Key',
    apiKeyHint: 'Starts with sk-ant-.',
    apiKeyInvalid: 'That does not look like an Anthropic key.',
    test: 'Test',
    save: 'Save',
    remove: 'Remove',
    saved: 'Key saved.',
    removed: 'Key removed.',
    testSuccess: 'The key works.',
    testFailed: 'The key was rejected.',
    error: 'That did not work.',
    loadError: 'Could not load the AI access.',
    loading: 'Loading',
  },
};

const A_KEY = 'sk-ant-api03-testkey_0123456789';

describe('AiSettingsPage', () => {
  const settingsValue = signal<AiSettings | undefined>({ ownKey: false });
  const settingsError = signal<Error | undefined>(undefined);
  const settingsLoading = signal(false);
  let savedKeys: string[];
  let testedKeys: string[];
  let clearCalls: number;
  let testResult: ApiKeyTestResult;
  const aiSettingsServiceStub = {
    settings: { value: settingsValue, error: settingsError, isLoading: settingsLoading },
    save: (apiKey: string) => {
      savedKeys.push(apiKey);
      settingsValue.set({ ownKey: true });
      return Promise.resolve();
    },
    clear: () => {
      clearCalls++;
      settingsValue.set({ ownKey: false });
      return Promise.resolve();
    },
    test: (apiKey: string) => {
      testedKeys.push(apiKey);
      return Promise.resolve(testResult);
    },
  } as unknown as AiSettingsService;

  let toasts: ToastMessageOptions[];

  beforeEach(async () => {
    settingsValue.set({ ownKey: false });
    settingsError.set(undefined);
    settingsLoading.set(false);
    savedKeys = [];
    testedKeys = [];
    clearCalls = 0;
    testResult = { success: true, message: '' };
    toasts = [];
    await TestBed.configureTestingModule({
      imports: [
        AiSettingsPage,
        TranslocoTestingModule.forRoot({
          langs: { en: translations },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
      providers: [
        provideZonelessChangeDetection(),
        { provide: AiSettingsService, useValue: aiSettingsServiceStub },
        { provide: MessageService, useValue: { add: (toast: ToastMessageOptions) => toasts.push(toast) } },
      ],
    }).compileComponents();
  });

  function createFixture() {
    const fixture = TestBed.createComponent(AiSettingsPage);
    fixture.detectChanges();
    return fixture;
  }

  async function typeKey(fixture: ReturnType<typeof createFixture>, value: string) {
    const input = (fixture.nativeElement as HTMLElement).querySelector('input#apiKey') as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }

  function button(fixture: ReturnType<typeof createFixture>, label: string): HTMLButtonElement {
    return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).find((candidate) =>
      candidate.textContent?.includes(label),
    ) as HTMLButtonElement;
  }

  it('says which account pays while no key is stored', () => {
    const element = createFixture().nativeElement as HTMLElement;

    expect(element.textContent).toContain("This tenant uses frontdesk's access.");
    // Nothing to remove yet.
    expect(element.textContent).not.toContain('Remove');
  });

  it('saves a key and empties the field, because the stored one never comes back', async () => {
    const fixture = createFixture();

    await typeKey(fixture, `  ${A_KEY}  `);
    (fixture.nativeElement as HTMLElement).querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    expect(savedKeys).toEqual([A_KEY]);
    expect(toasts[0].summary).toBe('Key saved.');
    expect((fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('input#apiKey')!.value).toBe('');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('This tenant uses its own key.');
  });

  it('refuses something that is not a key before calling the backend', async () => {
    const fixture = createFixture();

    await typeKey(fixture, 'anna@example.com');
    (fixture.nativeElement as HTMLElement).querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    expect(savedKeys).toEqual([]);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('That does not look like an Anthropic key.');
  });

  it('reports a rejected key with the provider’s own reason', async () => {
    testResult = { success: false, message: 'invalid x-api-key' };
    const fixture = createFixture();

    await typeKey(fixture, A_KEY);
    button(fixture, 'Test').click();
    await fixture.whenStable();

    expect(testedKeys).toEqual([A_KEY]);
    expect(toasts[0].summary).toBe('The key was rejected.');
    expect(toasts[0].detail).toBe('invalid x-api-key');
  });

  it('puts the tenant back on the platform’s access', async () => {
    settingsValue.set({ ownKey: true });
    const fixture = createFixture();

    button(fixture, 'Remove').click();
    await fixture.whenStable();

    expect(clearCalls).toBe(1);
    expect(toasts[0].summary).toBe('Key removed.');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain("This tenant uses frontdesk's access.");
  });
});
