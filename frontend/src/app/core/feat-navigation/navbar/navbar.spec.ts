import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';

import { provideRouter } from '@angular/router';

import { CompanyService } from '../../../shared/data/company-service';
import { Notification, NotificationsService } from '../../data/notifications-service';
import { AuthStore } from '../../../shared/data/auth-store';
import { THEME_STORAGE } from '../../data/theme-service';
import { Navbar } from './navbar';

const translations = {
  shell: {
    openMenu: 'Open menu',
    notifications: 'Notifications',
    noNotifications: 'Nothing new on your cases.',
    notificationAssigned: '{{actorName}} handed you a case',
    notificationFollowUp: 'The customer wrote again',
    darkMode: 'Switch to dark mode',
    lightMode: 'Switch to light mode',
    themeSettings: 'Customize theme',
    primaryColor: 'Primary color',
    primaryDefault: 'Default',
    surfaceColor: 'Surface',
    preset: 'Preset',
  },
};

function aNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    caseId: 'c1',
    subject: 'Rechnung 2026-081',
    type: 'assigned',
    actorName: 'Ben Beispiel',
    occurredAt: new Date('2026-08-19T08:30:00Z'),
    ...overrides,
  };
}

describe('Navbar', () => {
  const unseenCount = signal(0);
  const items = signal<Notification[]>([]);
  const markSeen = vi.fn();

  beforeEach(async () => {
    unseenCount.set(0);
    items.set([]);
    markSeen.mockClear();
    // PrimeNG's overlay queries matchMedia via the document's view; JSDOM does not implement it.
    const view = document.defaultView as unknown as { matchMedia?: (query: string) => Partial<MediaQueryList> };
    view.matchMedia ??= (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    });
    await TestBed.configureTestingModule({
      imports: [
        Navbar,
        TranslocoTestingModule.forRoot({
          langs: { en: translations },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
      // THEME_STORAGE as null: no real localStorage is reliably available in
      // unit tests (see theme-service.spec.ts), and this test only asserts the
      // visible toggle behavior.
      providers: [
        provideZonelessChangeDetection(),
        // The bell links to the case a notification is about.
        provideRouter([]),
        { provide: THEME_STORAGE, useValue: null },
        {
          provide: NotificationsService,
          useValue: { unseenCount, items, markSeen } as unknown as NotificationsService,
        },
        { provide: AuthStore, useValue: { avatarUrl: signal<string | null>(null) } as unknown as AuthStore },
        // The theme service reads the tenant's brand color from the company service.
        { provide: CompanyService, useValue: { primaryColor: signal<string | null>(null) } as unknown as CompanyService },
      ],
    }).compileComponents();
  });

  it('renders the menu and notification buttons with accessible labels', () => {
    const fixture = TestBed.createComponent(Navbar);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('button[aria-label="Open menu"]')).toBeTruthy();
    expect(element.querySelector('button[aria-label="Notifications"]')).toBeTruthy();
    expect(element.querySelector('button[aria-label="Customize theme"]')).toBeTruthy();
  });

  it('counts what is waiting on the bell, and shows nothing where nothing is', () => {
    const fixture = TestBed.createComponent(Navbar);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    // Nothing waiting: no badge at all rather than a nought.
    expect(element.querySelector('[data-notification-badge]')).toBeNull();

    unseenCount.set(3);
    fixture.detectChanges();

    expect(element.querySelector('[data-notification-badge]')?.textContent?.trim()).toBe('3');
  });

  it('lists what happened, links to the case, and reads it all on opening', async () => {
    unseenCount.set(2);
    items.set([aNotification(), aNotification({ caseId: 'c2', subject: 'Lieferung 4711', type: 'follow_up_received', actorName: null })]);
    const fixture = TestBed.createComponent(Navbar);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    element.querySelector<HTMLButtonElement>('button[aria-label="Notifications"]')!.click();
    await fixture.whenStable();

    const links = Array.from(document.querySelectorAll('.p-popover a'));
    expect(links).toHaveLength(2);
    // What happened, and on which case. The moment is formatted by the locale and is not what
    // this test is about.
    expect(links[0].textContent).toContain('Ben Beispiel handed you a case');
    expect(links[0].textContent).toContain('Rechnung 2026-081');
    // A customer writing again is nobody's doing, so the line names none.
    expect(links[1].textContent).toContain('The customer wrote again');
    expect(links[1].textContent).toContain('Lieferung 4711');
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['/cases/c1', '/cases/c2']);
    // Opening is reading: the badge goes, what is listed stays readable.
    expect(markSeen).toHaveBeenCalledTimes(1);
  });

  it('says so when there is nothing new, rather than showing an empty box', async () => {
    const fixture = TestBed.createComponent(Navbar);
    fixture.detectChanges();

    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('button[aria-label="Notifications"]')!.click();
    await fixture.whenStable();

    expect(document.querySelector('.p-popover')?.textContent).toContain('Nothing new on your cases.');
  });

  it('toggles between dark and light mode', () => {
    document.documentElement.classList.remove('dark');
    const fixture = TestBed.createComponent(Navbar);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    const toggle = element.querySelector<HTMLButtonElement>('button[aria-label="Switch to dark mode"]');
    expect(toggle?.querySelector('.pi-moon')).toBeTruthy();

    toggle?.click();
    fixture.detectChanges();

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    const lightToggle = element.querySelector('button[aria-label="Switch to light mode"]');
    expect(lightToggle?.querySelector('.pi-sun')).toBeTruthy();
  });
});
