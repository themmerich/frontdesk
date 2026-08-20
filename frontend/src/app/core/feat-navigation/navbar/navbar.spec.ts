import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';

import { THEME_STORAGE } from '../../data/theme-store';
import { Navbar } from './navbar';

const translations = {
  shell: {
    openMenu: 'Open menu',
    notifications: 'Notifications',
    darkMode: 'Switch to dark mode',
    lightMode: 'Switch to light mode',
    themeSettings: 'Customize theme',
    primaryColor: 'Primary color',
    surfaceColor: 'Surface',
    preset: 'Preset',
  },
};

describe('Navbar', () => {
  beforeEach(async () => {
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
      // unit tests (see theme-store.spec.ts), and this test only asserts the
      // visible toggle behavior.
      providers: [provideZonelessChangeDetection(), { provide: THEME_STORAGE, useValue: null }],
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
