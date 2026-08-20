import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';

import { Layout } from './layout';

const translations = {
  shell: {
    cases: 'Cases',
    inbox: 'Inbox',
    profile: 'Profile',
    settings: 'Settings',
    signOut: 'Sign out',
    demoUser: 'Demo user',
    openMenu: 'Open menu',
    notifications: 'Notifications',
  },
};

describe('Layout', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        Layout,
        TranslocoTestingModule.forRoot({
          langs: { en: translations },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
      providers: [provideZonelessChangeDetection(), provideRouter([])],
    }).compileComponents();
  });

  it('renders the brand and the navigation', () => {
    const fixture = TestBed.createComponent(Layout);
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent;
    expect(text).toContain('frontdesk');
    expect(text).toContain('Cases');
    expect(text).toContain('Inbox');
  });

  it('renders the routed content area', () => {
    const fixture = TestBed.createComponent(Layout);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('router-outlet')).toBeTruthy();
  });
});
