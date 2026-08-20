import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';

import { Navbar } from './navbar';

const translations = {
  shell: {
    openMenu: 'Open menu',
    notifications: 'Notifications',
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
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
  });

  it('renders the menu and notification buttons with accessible labels', () => {
    const fixture = TestBed.createComponent(Navbar);
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('button[aria-label="Open menu"]')).toBeTruthy();
    expect(element.querySelector('button[aria-label="Notifications"]')).toBeTruthy();
  });
});
