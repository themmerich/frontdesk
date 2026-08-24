import { HttpErrorResponse } from '@angular/common/http';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { MessageService, ToastMessageOptions } from 'primeng/api';

import { BranchService } from '../../../shared/data/branch-service';
import { CompanyService } from '../../../shared/data/company-service';
import { Branch } from '../../../shared/model/branch';
import { UsersService } from '../data/users-service';
import { User, UserCreate, UserUpdate } from '../model/user';
import { UsersPage } from './users-page';

const translations = {
  users: {
    title: 'Users',
    username: 'Username',
    role: 'Role',
    roleAdmin: 'Admin',
    roleUser: 'User',
    active: 'Status',
    activeTag: 'Active',
    inactiveTag: 'Inactive',
    createdAt: 'Created at',
    actions: 'Actions',
    activate: 'Activate',
    deactivate: 'Deactivate',
    activated: 'User activated.',
    deactivated: 'User deactivated.',
    selfDeactivate: 'You cannot deactivate yourself.',
    updateError: 'The change failed.',
    empty: 'No users found',
    loadError: 'Could not load users.',
    add: 'Add',
    addTitle: 'New user',
    edit: 'Edit',
    editTitle: 'Edit user',
    firstName: 'First name',
    lastName: 'Last name',
    password: 'Initial password',
    generatePassword: 'Generate password',
    company: 'Company',
    branch: 'Branch',
    headquarters: 'Headquarters',
    activeField: 'Active',
    cancel: 'Cancel',
    save: 'Save',
    usernameRequired: 'Please enter a username.',
    firstNameRequired: 'Please enter a first name.',
    lastNameRequired: 'Please enter a last name.',
    passwordTooShort: 'At least 8 characters.',
    created: 'User created.',
    saved: 'User saved.',
    saveError: 'The user could not be saved.',
    selfChange: 'You cannot take away your own access.',
    duplicate: 'This username is already taken.',
    createError: 'The user could not be created.',
  },
};

const headquarters: Branch = {
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
};

describe('UsersPage', () => {
  const users = signal<User[]>([]);
  const error = signal<Error | undefined>(undefined);
  let setActiveCalls: { user: User; active: boolean }[];
  let setActiveError: unknown;
  let toasts: ToastMessageOptions[];
  let createdUsers: UserCreate[];
  let updatedUsers: { id: string; update: UserUpdate }[];
  let createError: unknown;
  const usersServiceStub = {
    users: { value: users, error },
    create: (user: UserCreate) => {
      createdUsers.push(user);
      return createError ? Promise.reject(createError) : Promise.resolve();
    },
    update: (id: string, update: UserUpdate) => {
      updatedUsers.push({ id, update });
      return createError ? Promise.reject(createError) : Promise.resolve();
    },
    setActive: (user: User, active: boolean) => {
      setActiveCalls.push({ user, active });
      return setActiveError ? Promise.reject(setActiveError) : Promise.resolve();
    },
  } as unknown as UsersService;

  const companyServiceStub = { name: () => 'Musterfirma GmbH' } as unknown as CompanyService;
  const branchServiceStub = { branches: { value: signal<Branch[]>([headquarters]) } } as unknown as BranchService;

  const anna: User = {
    id: '1',
    username: 'anna',
    firstName: 'Anna',
    lastName: 'Admin',
    role: 'admin',
    active: true,
    branchId: 'b1',
    createdAt: new Date('2026-08-01T10:00:00Z'),
  };

  beforeEach(async () => {
    // PrimeNG's overlay queries matchMedia via the document's view; JSDOM does not implement it.
    const view = document.defaultView as unknown as { matchMedia?: (query: string) => Partial<MediaQueryList> };
    view.matchMedia ??= (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    });

    users.set([]);
    error.set(undefined);
    setActiveCalls = [];
    setActiveError = undefined;
    createdUsers = [];
    updatedUsers = [];
    createError = undefined;
    toasts = [];
    await TestBed.configureTestingModule({
      imports: [
        UsersPage,
        TranslocoTestingModule.forRoot({
          langs: { en: translations },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
      providers: [
        provideZonelessChangeDetection(),
        { provide: UsersService, useValue: usersServiceStub },
        { provide: CompanyService, useValue: companyServiceStub },
        { provide: BranchService, useValue: branchServiceStub },
        { provide: MessageService, useValue: { add: (toast: ToastMessageOptions) => toasts.push(toast) } },
      ],
    }).compileComponents();
  });

  function setInput(element: HTMLElement, id: string, value: string) {
    const input = element.querySelector('#' + id) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  /** Opens the dialog for an existing user through its row action. */
  async function openEditDialog(fixture: ComponentFixture<UsersPage>): Promise<HTMLElement> {
    const element = fixture.nativeElement as HTMLElement;
    element.querySelector<HTMLButtonElement>('tbody button[aria-label="Edit"]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();
    return element;
  }

  /** Opens the dialog through the toolbar button beside the export button. */
  async function openDialog(fixture: ComponentFixture<UsersPage>): Promise<HTMLElement> {
    const element = fixture.nativeElement as HTMLElement;
    const addButton = Array.from(element.querySelectorAll('button')).find((button) => button.textContent?.includes('Add'))!;
    addButton.click();
    await fixture.whenStable();
    fixture.detectChanges();
    return element;
  }

  it('shows the title and the users from the service', () => {
    users.set([anna]);
    const fixture = TestBed.createComponent(UsersPage);
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent;
    expect(text).toContain('Users');
    expect(text).toContain('Anna');
    expect(text).toContain('Admin');
  });

  it('shows the load error when the API is unreachable', () => {
    error.set(new Error('connection refused'));
    const fixture = TestBed.createComponent(UsersPage);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Could not load users.');
  });

  it('opens the dialog without marking the untouched fields invalid', async () => {
    const fixture = TestBed.createComponent(UsersPage);
    fixture.detectChanges();
    const element = await openDialog(fixture);

    expect(element.textContent).toContain('New user');
    // PrimeNG paints an invalid field red; an untouched one must not be judged yet.
    const invalidFields = element.querySelectorAll('.p-invalid');
    expect(invalidFields).toHaveLength(0);
    expect(element.textContent).not.toContain('Please enter a username.');
  });

  it('marks a field invalid once it was edited', async () => {
    const fixture = TestBed.createComponent(UsersPage);
    fixture.detectChanges();
    const element = await openDialog(fixture);

    setInput(element, 'username', 'clara');
    setInput(element, 'username', '');
    await fixture.whenStable();
    fixture.detectChanges();

    expect((element.querySelector('#username') as HTMLInputElement).classList).toContain('p-invalid');
    expect(element.textContent).toContain('Please enter a username.');
    // The untouched fields are still unjudged.
    expect((element.querySelector('#firstName') as HTMLInputElement).classList).not.toContain('p-invalid');
  });

  it('generates an initial password and reveals it', async () => {
    const fixture = TestBed.createComponent(UsersPage);
    fixture.detectChanges();
    const element = await openDialog(fixture);

    const password = element.querySelector('#password') as HTMLInputElement;
    expect(password.type).toBe('password');
    element.querySelector<HTMLButtonElement>('button[aria-label="Generate password"]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    // Long enough to pass the validator, and readable so the admin can pass it on.
    expect(password.value).toHaveLength(12);
    expect(password.type).toBe('text');
    expect(password.classList).not.toContain('p-invalid');
  });

  it('creates a user through the dialog, defaulting to an active ordinary user', async () => {
    const fixture = TestBed.createComponent(UsersPage);
    fixture.detectChanges();
    const element = await openDialog(fixture);

    // The company is the admin's own and stays read-only.
    const company = element.querySelector('#company') as HTMLInputElement;
    expect(company.value).toBe('Musterfirma GmbH');
    expect(company.disabled).toBe(true);

    setInput(element, 'username', ' clara ');
    setInput(element, 'password', 'geheim1234');
    setInput(element, 'firstName', ' Clara ');
    setInput(element, 'lastName', ' Neu ');
    await fixture.whenStable();
    element.querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    expect(createdUsers).toEqual([
      { username: 'clara', password: 'geheim1234', firstName: 'Clara', lastName: 'Neu', branchId: null, role: 'user', active: true },
    ]);
    expect(toasts[0].summary).toBe('User created.');
  });

  it('keeps an incomplete user unsaved and names the missing fields', async () => {
    const fixture = TestBed.createComponent(UsersPage);
    fixture.detectChanges();
    const element = await openDialog(fixture);

    setInput(element, 'username', 'clara');
    setInput(element, 'password', 'kurz');
    await fixture.whenStable();
    element.querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(createdUsers).toEqual([]);
    expect(element.textContent).toContain('At least 8 characters.');
    expect(element.textContent).toContain('Please enter a first name.');
  });

  it('reports a taken username distinctly', async () => {
    createError = new HttpErrorResponse({ status: 409 });
    const fixture = TestBed.createComponent(UsersPage);
    fixture.detectChanges();
    const element = await openDialog(fixture);

    setInput(element, 'username', 'anna');
    setInput(element, 'password', 'geheim1234');
    setInput(element, 'firstName', 'Anna');
    setInput(element, 'lastName', 'Zweit');
    await fixture.whenStable();
    element.querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    expect(toasts).toHaveLength(1);
    expect(toasts[0].severity).toBe('warn');
    expect(toasts[0].summary).toBe('This username is already taken.');
  });

  it('edits a user through its row action, prefilled and without the password', async () => {
    users.set([anna]);
    const fixture = TestBed.createComponent(UsersPage);
    fixture.detectChanges();
    const element = await openEditDialog(fixture);

    expect(element.textContent).toContain('Edit user');
    expect((element.querySelector('#username') as HTMLInputElement).value).toBe('anna');
    expect((element.querySelector('#firstName') as HTMLInputElement).value).toBe('Anna');
    // The password belongs to the user alone, so the dialog does not offer it.
    expect(element.querySelector('#password')).toBeNull();

    setInput(element, 'lastName', 'Adler');
    await fixture.whenStable();
    element.querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    expect(createdUsers).toEqual([]);
    expect(updatedUsers).toEqual([
      {
        id: '1',
        update: { username: 'anna', firstName: 'Anna', lastName: 'Adler', branchId: 'b1', role: 'admin', active: true },
      },
    ]);
    expect(toasts[0].summary).toBe('User saved.');
  });

  it('reports a rejected self-demotion distinctly', async () => {
    createError = new HttpErrorResponse({ status: 400 });
    users.set([anna]);
    const fixture = TestBed.createComponent(UsersPage);
    fixture.detectChanges();
    const element = await openEditDialog(fixture);

    setInput(element, 'lastName', 'Adler');
    await fixture.whenStable();
    element.querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    expect(toasts).toHaveLength(1);
    expect(toasts[0].severity).toBe('warn');
    expect(toasts[0].summary).toBe('You cannot take away your own access.');
  });

  it('deactivates a user through its row action and raises a toast', async () => {
    users.set([anna]);
    const fixture = TestBed.createComponent(UsersPage);
    fixture.detectChanges();

    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('tbody button[aria-label="Deactivate"]')!.click();
    await fixture.whenStable();

    expect(setActiveCalls).toEqual([{ user: anna, active: false }]);
    expect(toasts).toHaveLength(1);
    expect(toasts[0].summary).toBe('User deactivated.');
  });

  it('reports a rejected self-deactivation distinctly', async () => {
    setActiveError = new HttpErrorResponse({ status: 400 });
    users.set([anna]);
    const fixture = TestBed.createComponent(UsersPage);
    fixture.detectChanges();

    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('tbody button[aria-label="Deactivate"]')!.click();
    await fixture.whenStable();

    expect(toasts).toHaveLength(1);
    expect(toasts[0].severity).toBe('warn');
    expect(toasts[0].summary).toBe('You cannot deactivate yourself.');
  });
});
