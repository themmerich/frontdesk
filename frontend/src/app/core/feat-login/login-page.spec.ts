import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';

import { AuthStore } from '../data/auth-store';
import { LoginPage } from './login-page';

const translations = {
  login: {
    title: 'Sign in',
    email: 'Email address',
    password: 'Password',
    submit: 'Sign in',
    failed: 'Sign-in failed.',
    emailInvalid: 'Please enter a valid email address.',
    passwordRequired: 'Please enter your password.',
  },
};

describe('LoginPage', () => {
  let loginResult: boolean;
  let receivedCredentials: { email: string; password: string } | undefined;
  const authStoreStub = {
    login: (email: string, password: string) => {
      receivedCredentials = { email, password };
      return Promise.resolve(loginResult);
    },
  } as unknown as AuthStore;

  beforeEach(async () => {
    loginResult = true;
    receivedCredentials = undefined;
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

  function fillAndSubmit(fixture: ReturnType<typeof createFixture>, email: string, password: string) {
    const element = fixture.nativeElement as HTMLElement;
    const emailInput = element.querySelector('#email') as HTMLInputElement;
    const passwordInput = element.querySelector('#password') as HTMLInputElement;
    emailInput.value = email;
    emailInput.dispatchEvent(new Event('input'));
    passwordInput.value = password;
    passwordInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    element.querySelector('form')?.dispatchEvent(new Event('submit'));
  }

  it('renders the sign-in form', () => {
    const element = createFixture().nativeElement as HTMLElement;

    expect(element.querySelector('#email')).not.toBeNull();
    expect(element.querySelector('#password')).not.toBeNull();
    expect(element.querySelector('button[type="submit"]')?.textContent).toContain('Sign in');
  });

  it('does not call the backend while the form is invalid', async () => {
    const fixture = createFixture();

    fillAndSubmit(fixture, 'not-an-email', '');
    await fixture.whenStable();

    expect(receivedCredentials).toBeUndefined();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Please enter a valid email address.');
  });

  it('signs in and navigates to the requested page', async () => {
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const fixture = createFixture();

    fillAndSubmit(fixture, 'admin@frontdesk.local', 'secret');
    await fixture.whenStable();

    expect(receivedCredentials).toEqual({ email: 'admin@frontdesk.local', password: 'secret' });
    expect(navigateSpy).toHaveBeenCalledWith('/');
  });

  it('shows an error when the credentials are rejected', async () => {
    loginResult = false;
    const fixture = createFixture();

    fillAndSubmit(fixture, 'admin@frontdesk.local', 'wrong');
    await fixture.whenStable();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Sign-in failed.');
  });
});
