import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';

import { Sidebar } from './sidebar';

const translations = {
  shell: {
    cases: 'Cases',
    inbox: 'Inbox',
    profile: 'Profile',
    settings: 'Settings',
    signOut: 'Sign out',
    demoUser: 'Demo user',
  },
};

describe('Sidebar', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        Sidebar,
        TranslocoTestingModule.forRoot({
          langs: { en: translations },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
      providers: [provideZonelessChangeDetection(), provideRouter([])],
    }).compileComponents();
  });

  it('renders the brand and the navigation items', () => {
    const fixture = TestBed.createComponent(Sidebar);
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent;
    expect(text).toContain('frontdesk');
    expect(text).toContain('Cases');
    expect(text).toContain('Inbox');
  });

  it('links the inbox item to the start page', () => {
    const fixture = TestBed.createComponent(Sidebar);
    fixture.detectChanges();

    const inboxLink = (fixture.nativeElement as HTMLElement).querySelector('a[href="/"]');
    expect(inboxLink?.textContent).toContain('Inbox');
  });
});
