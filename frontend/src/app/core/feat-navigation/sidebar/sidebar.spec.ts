import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';

import { AuthStore, CurrentUser } from '../../data/auth-store';
import { Sidebar } from './sidebar';

const translations = {
  shell: {
    cases: 'Cases',
    inbox: 'Inbox',
    administration: 'Administration',
    users: 'Users',
    profile: 'Profile',
    emailSettings: 'Email',
    signOut: 'Sign out',
  },
};

describe('Sidebar', () => {
  const currentUser = signal<CurrentUser | null>(null);
  const authStoreStub = {
    currentUser,
    avatarUrl: signal<string | null>(null),
    logout: () => Promise.resolve(),
  } as unknown as AuthStore;

  beforeEach(async () => {
    currentUser.set({
      email: 'admin@frontdesk.local',
      displayName: 'Anna Admin',
      role: 'admin',
      tenantName: 'Musterfirma GmbH',
      hasAvatar: false,
    });
    await TestBed.configureTestingModule({
      imports: [
        Sidebar,
        TranslocoTestingModule.forRoot({
          langs: { en: translations },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
      providers: [provideZonelessChangeDetection(), provideRouter([]), { provide: AuthStore, useValue: authStoreStub }],
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

  it('shows the signed-in user with their tenant', () => {
    const fixture = TestBed.createComponent(Sidebar);
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent;
    expect(text).toContain('Anna Admin');
    expect(text).toContain('Musterfirma GmbH');
  });

  it('offers the administration section with the users entry to admins only', () => {
    const adminFixture = TestBed.createComponent(Sidebar);
    adminFixture.detectChanges();
    const adminElement = adminFixture.nativeElement as HTMLElement;
    expect(adminElement.textContent).toContain('Administration');
    expect(adminElement.querySelector('a[href="/users"]')?.textContent).toContain('Users');

    currentUser.set({
      email: 'user@frontdesk.local',
      displayName: 'Uwe User',
      role: 'user',
      tenantName: 'Musterfirma GmbH',
      hasAvatar: false,
    });
    const userFixture = TestBed.createComponent(Sidebar);
    userFixture.detectChanges();
    const userElement = userFixture.nativeElement as HTMLElement;
    expect(userElement.textContent).not.toContain('Administration');
    expect(userElement.querySelector('a[href="/users"]')).toBeNull();
  });

  it('offers the email settings entry in the administration section to admins only', () => {
    const adminFixture = TestBed.createComponent(Sidebar);
    adminFixture.detectChanges();
    expect((adminFixture.nativeElement as HTMLElement).querySelector('a[href="/settings"]')?.textContent).toContain('Email');

    currentUser.set({
      email: 'user@frontdesk.local',
      displayName: 'Uwe User',
      role: 'user',
      tenantName: 'Musterfirma GmbH',
      hasAvatar: false,
    });
    const userFixture = TestBed.createComponent(Sidebar);
    userFixture.detectChanges();
    expect((userFixture.nativeElement as HTMLElement).querySelector('a[href="/settings"]')).toBeNull();
  });
});
