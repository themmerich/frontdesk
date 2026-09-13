import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';

import { AuthStore } from '../data/auth-store';
import { LoginPage } from './login-page';

const translations = {
  login: {
    title: 'Sign in',
    tenant: 'Tenant',
    tenantHint: 'Leave empty as a super-user.',
    username: 'Username',
    password: 'Password',
    submit: 'Sign in',
    failed: 'Sign-in failed.',
    usernameRequired: 'Please enter your username.',
    passwordRequired: 'Please enter your password.',
  },
};

describe('LoginPage', () => {
  let loginResult: boolean;
  let receivedCredentials: { tenant: string; username: string; password: string } | undefined;
  // What the store reports after the login: a tenant user has a tenant, a super-user has none yet.
  const hasTenant = signal(true);
  const authStoreStub = {
    hasTenant,
    login: (tenant: string, username: string, password: string) => {
      receivedCredentials = { tenant, username, password };
      return Promise.resolve(loginResult);
    },
  } as unknown as AuthStore;

  beforeEach(async () => {
    loginResult = true;
    receivedCredentials = undefined;
    hasTenant.set(true);
    await TestBed.configureTestingModule({
      imports: [
        LoginPage,
        TranslocoTestingModule.forRoot({
          langs: { en: translations },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
      providers: [provideZonelessChangeDetection(), provideRouter([]), { provide: AuthStore, useValue: authStoreStub }],
    }).compileComponents();
  });

  function createFixture() {
    const fixture = TestBed.createComponent(LoginPage);
    fixture.detectChanges();
    return fixture;
  }

  function type(fixture: ReturnType<typeof createFixture>, id: string, value: string): void {
    const input = (fixture.nativeElement as HTMLElement).querySelector(`#${id}`) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  function fillAndSubmit(fixture: ReturnType<typeof createFixture>, tenant: string, username: string, password: string) {
    type(fixture, 'tenant', tenant);
    type(fixture, 'username', username);
    type(fixture, 'password', password);
    fixture.detectChanges();
    (fixture.nativeElement as HTMLElement).querySelector('form')?.dispatchEvent(new Event('submit'));
  }

  it('renders the sign-in form with the tenant field first', () => {
    const element = createFixture().nativeElement as HTMLElement;

    const ids = Array.from(element.querySelectorAll('input')).map((input) => input.id);
    expect(ids).toEqual(['tenant', 'username', 'password']);
    expect(element.textContent).toContain('Leave empty as a super-user.');
    expect(element.querySelector('button[type="submit"]')?.textContent).toContain('Sign in');
  });

  it('does not call the backend while the form is invalid', async () => {
    const fixture = createFixture();

    fillAndSubmit(fixture, 'musterfirma', '', '');
    await fixture.whenStable();

    expect(receivedCredentials).toBeUndefined();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Please enter your username.');
  });

  it('signs in with the Kennung and navigates to the requested page', async () => {
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const fixture = createFixture();

    fillAndSubmit(fixture, 'musterfirma', 'admin', 'secret');
    await fixture.whenStable();

    expect(receivedCredentials).toEqual({ tenant: 'musterfirma', username: 'admin', password: 'secret' });
    expect(navigateSpy).toHaveBeenCalledWith('/');
  });

  it('lets the tenant field stay empty, and sends a super-user without one to the tenants page', async () => {
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    hasTenant.set(false);
    const fixture = createFixture();

    fillAndSubmit(fixture, '', 'super', 'secret');
    await fixture.whenStable();

    expect(receivedCredentials).toEqual({ tenant: '', username: 'super', password: 'secret' });
    expect(navigateSpy).toHaveBeenCalledWith('/tenants');
  });

  it('shows an error when the credentials are rejected', async () => {
    loginResult = false;
    const fixture = createFixture();

    fillAndSubmit(fixture, 'musterfirma', 'admin', 'wrong');
    await fixture.whenStable();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Sign-in failed.');
  });
});
