import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';

import { MailSettingsStore } from '../data/mail-settings-store';
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
  let savedUpdates: MailSettingsUpdate[];
  const storeStub = {
    settings: { value: settingsValue, error: settingsError },
    save: (update: MailSettingsUpdate) => {
      savedUpdates.push(update);
      return Promise.resolve();
    },
  } as unknown as MailSettingsStore;

  beforeEach(async () => {
    settingsValue.set(greenMailSettings);
    settingsError.set(undefined);
    savedUpdates = [];
    await TestBed.configureTestingModule({
      imports: [
        SettingsPage,
        TranslocoTestingModule.forRoot({
          langs: { en: translations },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
      providers: [provideZonelessChangeDetection(), { provide: MailSettingsStore, useValue: storeStub }],
    }).compileComponents();
  });

  function createFixture() {
    const fixture = TestBed.createComponent(SettingsPage);
    fixture.detectChanges();
    return fixture;
  }

  it('shows the fixed GreenMail values read-only in GreenMail mode', () => {
    const element = createFixture().nativeElement as HTMLElement;

    expect(element.textContent).toContain('localhost:3143');
    expect(element.textContent).toContain('inbox@frontdesk.local');
    expect(element.querySelector('#imapHost')).toBeNull();
  });

  it('opens the connection form when switching to the custom mode', async () => {
    const fixture = createFixture();

    const customButton = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Own server'),
    ) as HTMLButtonElement;
    customButton.click();
    await fixture.whenStable();

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
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Settings saved.');
  });

  it('does not save an incomplete custom configuration', async () => {
    const fixture = createFixture();
    const element = fixture.nativeElement as HTMLElement;

    const customButton = Array.from(element.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Own server'),
    ) as HTMLButtonElement;
    customButton.click();
    await fixture.whenStable();

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

  it('shows the load error instead of the form when the settings cannot be loaded', () => {
    settingsError.set(new Error('forbidden'));

    const element = createFixture().nativeElement as HTMLElement;

    expect(element.textContent).toContain('Could not load the settings.');
    expect(element.querySelector('form')).toBeNull();
  });
});
