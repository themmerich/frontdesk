import { HttpErrorResponse } from '@angular/common/http';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { MessageService, ToastMessageOptions } from 'primeng/api';

import { AuthStore, CurrentUser } from '../data/auth-store';
import { ProfileStore } from '../data/profile-store';
import { ProfilePage } from './profile-page';

const translations = {
  profile: {
    title: 'Profile',
    picture: 'Profile picture',
    upload: 'Upload picture',
    remove: 'Remove picture',
    imageInvalid: 'Please choose a valid image.',
    pictureSaved: 'Profile picture saved.',
    pictureRemoved: 'Profile picture removed.',
    name: 'Display name',
    email: 'Email address',
    emailHint: 'Cannot be changed.',
    displayName: 'Display name',
    nameRequired: 'Please enter a display name.',
    nameSaved: 'Display name saved.',
    save: 'Save',
    password: 'Change password',
    currentPassword: 'Current password',
    newPassword: 'New password',
    confirmPassword: 'Repeat new password',
    required: 'Required.',
    passwordTooShort: 'At least 8 characters.',
    passwordMismatch: 'The passwords do not match.',
    changePassword: 'Change password',
    passwordChanged: 'Password changed.',
    passwordWrong: 'The current password is wrong.',
    error: 'Saving failed.',
  },
};

describe('ProfilePage', () => {
  const currentUser = signal<CurrentUser | null>({
    email: 'admin@frontdesk.local',
    displayName: 'Anna Admin',
    role: 'admin',
    tenantName: 'Musterfirma GmbH',
    hasAvatar: false,
  });
  const avatarUrl = signal<string | null>(null);
  const authStoreStub = { currentUser, avatarUrl } as unknown as AuthStore;

  let renamedTo: string[];
  let passwordChanges: { currentPassword: string; newPassword: string }[];
  let changePasswordError: unknown;
  let toasts: ToastMessageOptions[];
  const profileStoreStub = {
    rename: (displayName: string) => {
      renamedTo.push(displayName);
      return Promise.resolve();
    },
    changePassword: (currentPassword: string, newPassword: string) => {
      passwordChanges.push({ currentPassword, newPassword });
      return changePasswordError ? Promise.reject(changePasswordError) : Promise.resolve();
    },
  } as unknown as ProfileStore;

  beforeEach(async () => {
    renamedTo = [];
    passwordChanges = [];
    changePasswordError = undefined;
    toasts = [];
    avatarUrl.set(null);
    await TestBed.configureTestingModule({
      imports: [
        ProfilePage,
        TranslocoTestingModule.forRoot({
          langs: { en: translations },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
      providers: [
        provideZonelessChangeDetection(),
        { provide: AuthStore, useValue: authStoreStub },
        { provide: ProfileStore, useValue: profileStoreStub },
        { provide: MessageService, useValue: { add: (toast: ToastMessageOptions) => toasts.push(toast) } },
      ],
    }).compileComponents();
  });

  function createFixture() {
    const fixture = TestBed.createComponent(ProfilePage);
    fixture.detectChanges();
    return fixture;
  }

  function setInput(element: HTMLElement, id: string, value: string) {
    const input = element.querySelector('#' + id) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  it('shows the stored profile with the read-only email address', () => {
    const element = createFixture().nativeElement as HTMLElement;

    expect((element.querySelector('#displayName') as HTMLInputElement).value).toBe('Anna Admin');
    const email = element.querySelector('#email') as HTMLInputElement;
    expect(email.value).toBe('admin@frontdesk.local');
    expect(email.disabled).toBe(true);
  });

  it('saves a changed display name and raises a toast', async () => {
    const fixture = createFixture();
    const element = fixture.nativeElement as HTMLElement;

    setInput(element, 'displayName', 'Anna Anders');
    await fixture.whenStable();
    element.querySelectorAll('form')[0].dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    expect(renamedTo).toEqual(['Anna Anders']);
    expect(toasts).toHaveLength(1);
    expect(toasts[0].summary).toBe('Display name saved.');
  });

  it('does not save a blank display name', async () => {
    const fixture = createFixture();
    const element = fixture.nativeElement as HTMLElement;

    setInput(element, 'displayName', '');
    await fixture.whenStable();
    element.querySelectorAll('form')[0].dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(renamedTo).toHaveLength(0);
    expect(element.textContent).toContain('Please enter a display name.');
  });

  it('changes the password and clears the form', async () => {
    const fixture = createFixture();
    const element = fixture.nativeElement as HTMLElement;

    setInput(element, 'currentPassword', 'altes-passwort');
    setInput(element, 'newPassword', 'neues-passwort');
    setInput(element, 'confirmPassword', 'neues-passwort');
    await fixture.whenStable();
    element.querySelectorAll('form')[1].dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    expect(passwordChanges).toEqual([{ currentPassword: 'altes-passwort', newPassword: 'neues-passwort' }]);
    expect(toasts[0].summary).toBe('Password changed.');
    expect((element.querySelector('#currentPassword') as HTMLInputElement).value).toBe('');
  });

  it('rejects a mismatched password confirmation before calling the backend', async () => {
    const fixture = createFixture();
    const element = fixture.nativeElement as HTMLElement;

    setInput(element, 'currentPassword', 'altes-passwort');
    setInput(element, 'newPassword', 'neues-passwort');
    setInput(element, 'confirmPassword', 'anders');
    await fixture.whenStable();
    element.querySelectorAll('form')[1].dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(passwordChanges).toHaveLength(0);
    expect(element.textContent).toContain('The passwords do not match.');
  });

  it('reports a wrong current password distinctly', async () => {
    changePasswordError = new HttpErrorResponse({ status: 400 });
    const fixture = createFixture();
    const element = fixture.nativeElement as HTMLElement;

    setInput(element, 'currentPassword', 'falsch');
    setInput(element, 'newPassword', 'neues-passwort');
    setInput(element, 'confirmPassword', 'neues-passwort');
    await fixture.whenStable();
    element.querySelectorAll('form')[1].dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    expect(toasts).toHaveLength(1);
    expect(toasts[0].severity).toBe('warn');
    expect(toasts[0].summary).toBe('The current password is wrong.');
  });

  it('offers the remove button only while a picture exists', async () => {
    const fixture = createFixture();
    const hasRemoveButton = () =>
      Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).some((button) =>
        button.textContent?.includes('Remove picture'),
      );

    expect(hasRemoveButton()).toBe(false);

    avatarUrl.set('/api/profile/avatar?v=1');
    await fixture.whenStable();
    fixture.detectChanges();

    expect(hasRemoveButton()).toBe(true);
  });
});
