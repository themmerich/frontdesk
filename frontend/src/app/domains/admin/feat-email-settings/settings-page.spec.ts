import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { MessageService, ToastMessageOptions } from 'primeng/api';

import { MailSettingsService } from '../data/mail-settings-service';
import { MailSettings, MailSettingsUpdate } from '../model/mail-settings';
import { SettingsPage } from './settings-page';

const translations = {
  settings: {
    title: 'Email settings',
    mode: 'Mode',
    modeGreenmail: 'GreenMail (development)',
    modeCustom: 'Own server (IMAP/SMTP)',
    greenmailInfo: 'Fixed local development mail server:',
    imap: 'Incoming mail (IMAP)',
    smtp: 'Outgoing mail (SMTP)',
    host: 'Host',
    port: 'Port',
    tls: 'Use TLS',
    credentials: 'Credentials',
    username: 'Username',
    password: 'Password',
    passwordHint: 'Leave blank to keep the stored password.',
    folder: 'Folder',
    pollingEnabled: 'Poll the mailbox automatically',
    presets: 'Presets',
    presetNoteAppPassword: 'This provider requires an app password.',
    testConnection: 'Test connection',
    testSuccess: 'Connection successful.',
    testFailed: 'Connection failed',
    testError: 'The connection test could not be run.',
    save: 'Save',
    saved: 'Settings saved.',
    saveError: 'Saving failed.',
    loadError: 'Could not load the settings.',
    required: 'Required.',
    invalidPort: 'Enter a port between 1 and 65535.',
  },
};

const greenMailSettings: MailSettings = {
  mode: 'GREENMAIL',
  imapHost: 'localhost',
  imapPort: 3143,
  imapTls: false,
  smtpHost: 'localhost',
  smtpPort: 3025,
  smtpTls: false,
  username: 'inbox@frontdesk.local',
  folder: 'INBOX',
  pollingEnabled: true,
};

describe('SettingsPage', () => {
  const settingsValue = signal<MailSettings | undefined>(greenMailSettings);
  const settingsError = signal<Error | undefined>(undefined);
  const settingsLoading = signal(false);
  let savedUpdates: MailSettingsUpdate[];
  let testedUpdates: MailSettingsUpdate[];
  let testResult: { success: boolean; message: string };
  const mailSettingsServiceStub = {
    settings: { value: settingsValue, error: settingsError, isLoading: settingsLoading },
    save: (update: MailSettingsUpdate) => {
      savedUpdates.push(update);
      return Promise.resolve();
    },
    test: (update: MailSettingsUpdate) => {
      testedUpdates.push(update);
      return Promise.resolve(testResult);
    },
  } as unknown as MailSettingsService;

  let toasts: ToastMessageOptions[];

  beforeEach(async () => {
    settingsValue.set(greenMailSettings);
    settingsError.set(undefined);
    settingsLoading.set(false);
    savedUpdates = [];
    testedUpdates = [];
    testResult = { success: true, message: '' };
    toasts = [];
    await TestBed.configureTestingModule({
      imports: [
        SettingsPage,
        TranslocoTestingModule.forRoot({
          langs: { en: translations },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
      providers: [
        provideZonelessChangeDetection(),
        { provide: MailSettingsService, useValue: mailSettingsServiceStub },
        { provide: MessageService, useValue: { add: (toast: ToastMessageOptions) => toasts.push(toast) } },
      ],
    }).compileComponents();
  });

  function createFixture() {
    const fixture = TestBed.createComponent(SettingsPage);
    fixture.detectChanges();
    return fixture;
  }

  // PrimeNG's toggle buttons are host-based: the p-togglebutton element itself is the button.
  async function switchToCustomMode(fixture: ReturnType<typeof createFixture>) {
    const customToggle = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('p-selectbutton [role="button"]'),
    ).find((toggle) => toggle.textContent?.includes('Own server'));
    customToggle!.click();
    await fixture.whenStable();
  }

  function saveButton(fixture: ReturnType<typeof createFixture>): HTMLButtonElement {
    return (fixture.nativeElement as HTMLElement).querySelector('button[type="submit"]') as HTMLButtonElement;
  }

  it('shows the fixed GreenMail values read-only in GreenMail mode', () => {
    const element = createFixture().nativeElement as HTMLElement;

    expect(element.textContent).toContain('localhost:3143');
    expect(element.textContent).toContain('inbox@frontdesk.local');
    expect(element.querySelector('#imapHost')).toBeNull();
  });

  it('opens the connection form when switching to the custom mode', async () => {
    const fixture = createFixture();
    await switchToCustomMode(fixture);

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('#imapHost')).not.toBeNull();
    expect(element.querySelector('#password')).not.toBeNull();
    // Prefilled from the loaded settings.
    expect((element.querySelector('#imapHost') as HTMLInputElement).value).toBe('localhost');
  });

  it('saves the GreenMail mode without validating the hidden connection form', async () => {
    const fixture = createFixture();

    (fixture.nativeElement as HTMLElement).querySelector('form')?.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(savedUpdates).toHaveLength(1);
    expect(savedUpdates[0].mode).toBe('GREENMAIL');
    expect(toasts).toHaveLength(1);
    expect(toasts[0].severity).toBe('success');
    expect(toasts[0].summary).toBe('Settings saved.');
  });

  it('enables saving only while the form is valid and dirty', async () => {
    const fixture = createFixture();

    // Freshly loaded means pristine — there is nothing to save yet.
    expect(saveButton(fixture).disabled).toBe(true);

    await switchToCustomMode(fixture);
    fixture.detectChanges();
    expect(saveButton(fixture).disabled).toBe(false);

    const element = fixture.nativeElement as HTMLElement;
    const imapHost = element.querySelector('#imapHost') as HTMLInputElement;
    imapHost.value = '';
    imapHost.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    fixture.detectChanges();
    expect(saveButton(fixture).disabled).toBe(true);
  });

  it('arms the save button when a preset is applied to an otherwise pristine form', async () => {
    settingsValue.set({ ...greenMailSettings, mode: 'CUSTOM' });
    const fixture = createFixture();
    const element = fixture.nativeElement as HTMLElement;

    expect(saveButton(fixture).disabled).toBe(true);

    const gmxButton = Array.from(element.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'GMX',
    ) as HTMLButtonElement;
    gmxButton.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(saveButton(fixture).disabled).toBe(false);
  });

  it('does not save an incomplete custom configuration', async () => {
    const fixture = createFixture();
    const element = fixture.nativeElement as HTMLElement;
    await switchToCustomMode(fixture);

    const imapHost = element.querySelector('#imapHost') as HTMLInputElement;
    imapHost.value = '';
    imapHost.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    element.querySelector('form')?.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(savedUpdates).toHaveLength(0);
    expect(element.textContent).toContain('Required.');
  });

  it('prefills the connection from a provider preset, leaving the credentials alone', async () => {
    const fixture = createFixture();
    const element = fixture.nativeElement as HTMLElement;
    await switchToCustomMode(fixture);

    const usernameInput = element.querySelector('#username') as HTMLInputElement;
    usernameInput.value = 'buero@musterfirma.de';
    usernameInput.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    const gmxButton = Array.from(element.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'GMX',
    ) as HTMLButtonElement;
    gmxButton.click();
    await fixture.whenStable();

    expect((element.querySelector('#imapHost') as HTMLInputElement).value).toBe('imap.gmx.net');
    expect((element.querySelector('#imapPort') as HTMLInputElement).value).toBe('993');
    expect((element.querySelector('#smtpHost') as HTMLInputElement).value).toBe('mail.gmx.net');
    expect((element.querySelector('#username') as HTMLInputElement).value).toBe('buero@musterfirma.de');
  });

  it('shows the app-password note for providers that need one', async () => {
    const fixture = createFixture();
    const element = fixture.nativeElement as HTMLElement;
    await switchToCustomMode(fixture);

    const gmailButton = Array.from(element.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Gmail',
    ) as HTMLButtonElement;
    gmailButton.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(element.textContent).toContain('This provider requires an app password.');
  });

  it('probes the mailbox with the current form values without saving, raising a success toast', async () => {
    const fixture = createFixture();
    const element = fixture.nativeElement as HTMLElement;
    await switchToCustomMode(fixture);

    const testButton = Array.from(element.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Test connection'),
    ) as HTMLButtonElement;
    testButton.click();
    await fixture.whenStable();

    expect(testedUpdates).toHaveLength(1);
    expect(testedUpdates[0].imapHost).toBe('localhost');
    expect(savedUpdates).toHaveLength(0);
    expect(toasts).toHaveLength(1);
    expect(toasts[0].severity).toBe('success');
    expect(toasts[0].summary).toBe('Connection successful.');
  });

  it('raises a warning toast with the technical reason when the probe fails', async () => {
    testResult = { success: false, message: 'AUTHENTICATIONFAILED' };
    const fixture = createFixture();
    const element = fixture.nativeElement as HTMLElement;
    await switchToCustomMode(fixture);

    const testButton = Array.from(element.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Test connection'),
    ) as HTMLButtonElement;
    testButton.click();
    await fixture.whenStable();

    expect(toasts).toHaveLength(1);
    expect(toasts[0].severity).toBe('warn');
    expect(toasts[0].summary).toBe('Connection failed');
    expect(toasts[0].detail).toBe('AUTHENTICATIONFAILED');
  });

  it('does not probe while the fields the probe needs are invalid', async () => {
    const fixture = createFixture();
    const element = fixture.nativeElement as HTMLElement;
    await switchToCustomMode(fixture);

    const imapHost = element.querySelector('#imapHost') as HTMLInputElement;
    imapHost.value = '';
    imapHost.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    const testButton = Array.from(element.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Test connection'),
    ) as HTMLButtonElement;
    testButton.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(testedUpdates).toHaveLength(0);
    expect(element.textContent).toContain('Required.');
  });

  it('renders no form while the settings are still loading, so nothing can be saved prematurely', () => {
    settingsValue.set(undefined);
    settingsLoading.set(true);

    const element = createFixture().nativeElement as HTMLElement;

    // A save in the loading window would silently write the defaults over the stored configuration.
    expect(element.querySelector('form')).toBeNull();
  });

  it('shows the load error instead of the form when the settings cannot be loaded', () => {
    settingsError.set(new Error('forbidden'));

    const element = createFixture().nativeElement as HTMLElement;

    expect(element.textContent).toContain('Could not load the settings.');
    expect(element.querySelector('form')).toBeNull();
  });
});
