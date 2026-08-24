import { HttpErrorResponse } from '@angular/common/http';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { MessageService, ToastMessageOptions } from 'primeng/api';

import { BranchService } from '../../shared/data/branch-service';
import { CompanyService } from '../../shared/data/company-service';
import { Branch } from '../../shared/model/branch';
import { AuthStore } from '../data/auth-store';
import { Profile, ProfileService, ProfileUpdate } from '../data/profile-service';
import { ProfilePage } from './profile-page';

const translations = {
  profile: {
    title: 'Profile',
    personal: 'Personal data',
    picture: 'Profile picture',
    upload: 'Upload picture',
    remove: 'Remove picture',
    imageInvalid: 'Please choose a valid image.',
    pictureSaved: 'Profile picture saved.',
    pictureRemoved: 'Profile picture removed.',
    firstName: 'First name',
    lastName: 'Last name',
    firstNameRequired: 'Please enter a first name.',
    lastNameRequired: 'Please enter a last name.',
    birthDate: 'Date of birth',
    companyData: 'Company',
    company: 'Company name',
    branch: 'Branch',
    headquarters: 'Headquarters',
    joinedAt: 'Joining date',
    contact: 'Contact',
    email: 'Email address',
    emailInvalid: 'Please enter a valid email address.',
    phone: 'Phone',
    fax: 'Fax',
    save: 'Save',
    saved: 'Profile saved.',
    account: 'Sign-in',
    username: 'Username',
    usernameHint: 'Cannot be changed.',
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
    loadError: 'Could not load the profile.',
  },
};

const storedProfile: Profile = {
  username: 'anna',
  firstName: 'Anna',
  lastName: 'Admin',
  birthDate: '1990-04-23',
  joinedAt: '2020-01-01',
  branchId: 'b1',
  email: 'anna@musterfirma.example',
  phone: null,
  fax: null,
};

const branches: Branch[] = [
  {
    id: 'b1',
    name: 'Musterfirma GmbH',
    headquarters: true,
    street: null,
    postalCode: null,
    city: null,
    country: null,
    phone: null,
    fax: null,
    email: null,
  },
  {
    id: 'b2',
    name: 'Filiale Hamburg',
    headquarters: false,
    street: null,
    postalCode: null,
    city: null,
    country: null,
    phone: null,
    fax: null,
    email: null,
  },
];

describe('ProfilePage', () => {
  const avatarUrl = signal<string | null>(null);
  const authStoreStub = { avatarUrl } as unknown as AuthStore;

  const branchesValue = signal<Branch[]>(branches);
  const branchServiceStub = { branches: { value: branchesValue } } as unknown as BranchService;
  const companyServiceStub = { name: () => 'Musterfirma GmbH' } as unknown as CompanyService;

  const profileValue = signal<Profile | null>(null);
  const error = signal<Error | undefined>(undefined);
  let savedUpdates: ProfileUpdate[];
  let passwordChanges: { currentPassword: string; newPassword: string }[];
  let changePasswordError: unknown;
  let removedAvatar: boolean;
  let toasts: ToastMessageOptions[];
  const profileServiceStub = {
    profile: { value: profileValue, error },
    save: (update: ProfileUpdate) => {
      savedUpdates.push(update);
      return Promise.resolve();
    },
    changePassword: (currentPassword: string, newPassword: string) => {
      passwordChanges.push({ currentPassword, newPassword });
      return changePasswordError ? Promise.reject(changePasswordError) : Promise.resolve();
    },
    removeAvatar: () => {
      removedAvatar = true;
      return Promise.resolve();
    },
  } as unknown as ProfileService;

  beforeEach(async () => {
    // PrimeNG's overlay queries matchMedia via the document's view; JSDOM does not implement it.
    const view = document.defaultView as unknown as { matchMedia?: (query: string) => Partial<MediaQueryList> };
    view.matchMedia ??= (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    });

    profileValue.set(storedProfile);
    error.set(undefined);
    avatarUrl.set(null);
    savedUpdates = [];
    passwordChanges = [];
    changePasswordError = undefined;
    removedAvatar = false;
    toasts = [];
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
        { provide: BranchService, useValue: branchServiceStub },
        { provide: CompanyService, useValue: companyServiceStub },
        { provide: ProfileService, useValue: profileServiceStub },
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

  it("names the company beside the site, both beyond the user's reach", () => {
    const element = createFixture().nativeElement as HTMLElement;

    const company = element.querySelector('#company') as HTMLInputElement;
    expect(company.value).toBe('Musterfirma GmbH');
    expect(company.disabled).toBe(true);
  });

  it('opens the password fields unjudged, and marks them once edited', async () => {
    const fixture = createFixture();
    const element = fixture.nativeElement as HTMLElement;

    // Empty and required, but the user has not touched them yet.
    expect(element.querySelectorAll('.p-invalid')).toHaveLength(0);
    expect(element.textContent).not.toContain('Required.');

    setInput(element, 'newPassword', 'kurz');
    await fixture.whenStable();
    fixture.detectChanges();

    expect((element.querySelector('#newPassword') as HTMLInputElement).classList).toContain('p-invalid');
    expect(element.textContent).toContain('At least 8 characters.');
    // The neighbours stay unjudged until they are edited themselves.
    expect((element.querySelector('#currentPassword') as HTMLInputElement).classList).not.toContain('p-invalid');
  });

  it('shows the stored profile with the read-only username', () => {
    const element = createFixture().nativeElement as HTMLElement;

    expect((element.querySelector('#firstName') as HTMLInputElement).value).toBe('Anna');
    expect((element.querySelector('#lastName') as HTMLInputElement).value).toBe('Admin');
    // The assigned site shows as the dropdown's selection, with the headquarters marked.
    expect(element.querySelector('p-select')?.textContent).toContain('Musterfirma GmbH (Headquarters)');
    expect((element.querySelector('#email') as HTMLInputElement).value).toBe('anna@musterfirma.example');
    // Absent optional fields render as empty inputs.
    expect((element.querySelector('#phone') as HTMLInputElement).value).toBe('');
    const username = element.querySelector('#username') as HTMLInputElement;
    expect(username.value).toBe('anna');
    expect(username.disabled).toBe(true);
  });

  it('saves the edited profile with ISO dates and raises a toast', async () => {
    const fixture = createFixture();
    const element = fixture.nativeElement as HTMLElement;

    setInput(element, 'lastName', ' Anders ');
    setInput(element, 'phone', '0123 456789');
    await fixture.whenStable();
    element.querySelectorAll('form')[0].dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    expect(savedUpdates).toHaveLength(1);
    expect(savedUpdates[0].lastName).toBe('Anders');
    expect(savedUpdates[0].phone).toBe('0123 456789');
    expect(savedUpdates[0].branchId).toBe('b1');
    // The stored ISO dates survive the datepicker round trip without a timezone shift.
    expect(savedUpdates[0].birthDate).toBe('1990-04-23');
    expect(savedUpdates[0].joinedAt).toBe('2020-01-01');
    expect(toasts[0].summary).toBe('Profile saved.');
    // The saved state is the new pristine baseline — the button disarms again.
    fixture.detectChanges();
    expect((element.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(true);
  });

  it('enables saving only while the form is valid and dirty', async () => {
    const fixture = createFixture();
    const element = fixture.nativeElement as HTMLElement;
    const saveButton = () => element.querySelector('button[type="submit"]') as HTMLButtonElement;

    // Freshly loaded means pristine — there is nothing to save yet.
    expect(saveButton().disabled).toBe(true);

    setInput(element, 'phone', '0123 456789');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(saveButton().disabled).toBe(false);

    setInput(element, 'firstName', '');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(saveButton().disabled).toBe(true);
  });

  it('does not save a blank name', async () => {
    const fixture = createFixture();
    const element = fixture.nativeElement as HTMLElement;

    setInput(element, 'lastName', '');
    await fixture.whenStable();
    element.querySelectorAll('form')[0].dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(savedUpdates).toHaveLength(0);
    expect(element.textContent).toContain('Please enter a last name.');
  });

  it('rejects a broken email address before calling the backend', async () => {
    const fixture = createFixture();
    const element = fixture.nativeElement as HTMLElement;

    setInput(element, 'email', 'not-an-email');
    await fixture.whenStable();
    element.querySelectorAll('form')[0].dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(savedUpdates).toHaveLength(0);
    expect(element.textContent).toContain('Please enter a valid email address.');
  });

  it('offers the company sites in the dropdown and saves the choice', async () => {
    const fixture = createFixture();
    const element = fixture.nativeElement as HTMLElement;

    (element.querySelector('p-select') as HTMLElement).click();
    await fixture.whenStable();

    const options = Array.from(document.querySelectorAll('li[role="option"]'));
    expect(options.map((option) => option.textContent?.trim())).toEqual(['Musterfirma GmbH (Headquarters)', 'Filiale Hamburg']);

    (options[1] as HTMLElement).click();
    await fixture.whenStable();
    element.querySelectorAll('form')[0].dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    expect(savedUpdates).toHaveLength(1);
    expect(savedUpdates[0].branchId).toBe('b2');
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

  it('offers the remove button only while a picture exists, and removes through it', async () => {
    const fixture = createFixture();
    const removeButton = () =>
      (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('button[aria-label="Remove picture"]');

    expect(removeButton()).toBeNull();

    avatarUrl.set('/api/profile/avatar?v=1');
    await fixture.whenStable();
    fixture.detectChanges();

    removeButton()!.click();
    await fixture.whenStable();

    expect(removedAvatar).toBe(true);
  });

  it('shows the load error when the API is unreachable', () => {
    error.set(new Error('connection refused'));
    const fixture = createFixture();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Could not load the profile.');
  });
});
