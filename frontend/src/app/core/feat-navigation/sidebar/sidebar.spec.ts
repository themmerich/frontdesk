import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';

import { CompanyService } from '../../../shared/data/company-service';
import { AuthStore, CurrentUser } from '../../data/auth-store';
import { Sidebar } from './sidebar';

const translations = {
  shell: {
    cases: 'Cases',
    inbox: 'Inbox',
    administration: 'Administration',
    users: 'Users',
    company: 'Company',
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

  const companyName = signal<string | undefined>(undefined);
  const logoUrl = signal<string | null>(null);
  const largeLogoUrl = signal<string | null>(null);
  const companyServiceStub = { name: companyName, logoUrl, largeLogoUrl } as unknown as CompanyService;

  beforeEach(async () => {
    currentUser.set({
      email: 'admin@frontdesk.local',
      displayName: 'Anna Admin',
      role: 'admin',
      tenantName: 'Musterfirma GmbH',
      hasAvatar: false,
    });
    companyName.set(undefined);
    logoUrl.set(null);
    largeLogoUrl.set(null);
    await TestBed.configureTestingModule({
      imports: [
        Sidebar,
        TranslocoTestingModule.forRoot({
          langs: { en: translations },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: AuthStore, useValue: authStoreStub },
        { provide: CompanyService, useValue: companyServiceStub },
      ],
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

  it('brands with the company name and logo once loaded, falling back to frontdesk', async () => {
    const fixture = TestBed.createComponent(Sidebar);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.textContent).toContain('frontdesk');
    expect(element.querySelector('svg')).not.toBeNull();
    expect(element.querySelector('img[src^="/api/company/logo"]')).toBeNull();

    companyName.set('Musterfirma AG');
    logoUrl.set('/api/company/logo?v=1');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(element.textContent).toContain('Musterfirma AG');
    expect(element.textContent).not.toContain('frontdesk');
    expect(element.querySelector('img[src^="/api/company/logo"]')).not.toBeNull();
    expect(element.querySelector('svg')).toBeNull();
  });

  it('brands with one large logo replacing logo and name in logo-only mode', async () => {
    const fixture = TestBed.createComponent(Sidebar);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    companyName.set('Musterfirma AG');
    logoUrl.set('/api/company/logo?v=1');
    largeLogoUrl.set('/api/company/logo?v=1');
    await fixture.whenStable();
    fixture.detectChanges();

    const brandImages = element.querySelectorAll('img[src^="/api/company/logo"]');
    expect(brandImages).toHaveLength(1);
    // The large logo carries the name itself — the brand area shows no separate name text.
    expect(brandImages[0].getAttribute('alt')).toBe('Musterfirma AG');
    expect(element.querySelector('svg')).toBeNull();
    // The name still appears in the footer's tenant line, but not beside the logo.
    const brandArea = brandImages[0].parentElement as HTMLElement;
    expect(brandArea.textContent?.trim()).toBe('');
  });

  it('shows the live company name in the footer once loaded', async () => {
    const fixture = TestBed.createComponent(Sidebar);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    // Until the company loaded, the session's tenant name bridges the gap.
    expect(element.textContent).toContain('Musterfirma GmbH');

    companyName.set('Musterfirma AG');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(element.textContent).not.toContain('Musterfirma GmbH');
    expect(element.textContent).toContain('Musterfirma AG');
  });

  it('offers the administration section with the users entry to admins only', () => {
    const adminFixture = TestBed.createComponent(Sidebar);
    adminFixture.detectChanges();
    const adminElement = adminFixture.nativeElement as HTMLElement;
    expect(adminElement.textContent).toContain('Administration');
    expect(adminElement.querySelector('a[href="/users"]')?.textContent).toContain('Users');
    expect(adminElement.querySelector('a[href="/company"]')?.textContent).toContain('Company');

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
