import { HttpErrorResponse } from '@angular/common/http';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { MessageService, ToastMessageOptions } from 'primeng/api';

import { UsersService } from '../data/users-service';
import { User } from '../model/user';
import { UsersPage } from './users-page';

const translations = {
  users: {
    title: 'Users',
    displayName: 'Display name',
    email: 'Email address',
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
  },
};

describe('UsersPage', () => {
  const users = signal<User[]>([]);
  const error = signal<Error | undefined>(undefined);
  let setActiveCalls: { user: User; active: boolean }[];
  let setActiveError: unknown;
  let toasts: ToastMessageOptions[];
  const usersServiceStub = {
    users: { value: users, error },
    setActive: (user: User, active: boolean) => {
      setActiveCalls.push({ user, active });
      return setActiveError ? Promise.reject(setActiveError) : Promise.resolve();
    },
  } as unknown as UsersService;

  const anna: User = {
    id: '1',
    email: 'anna@musterfirma.example',
    displayName: 'Anna Admin',
    role: 'admin',
    active: true,
    createdAt: new Date('2026-08-01T10:00:00Z'),
  };

  beforeEach(async () => {
    users.set([]);
    error.set(undefined);
    setActiveCalls = [];
    setActiveError = undefined;
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
        { provide: MessageService, useValue: { add: (toast: ToastMessageOptions) => toasts.push(toast) } },
      ],
    }).compileComponents();
  });

  it('shows the title and the users from the service', () => {
    users.set([anna]);
    const fixture = TestBed.createComponent(UsersPage);
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent;
    expect(text).toContain('Users');
    expect(text).toContain('Anna Admin');
  });

  it('shows the load error when the API is unreachable', () => {
    error.set(new Error('connection refused'));
    const fixture = TestBed.createComponent(UsersPage);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Could not load users.');
  });

  it('deactivates a user through its row action and raises a toast', async () => {
    users.set([anna]);
    const fixture = TestBed.createComponent(UsersPage);
    fixture.detectChanges();

    ((fixture.nativeElement as HTMLElement).querySelector('tbody button') as HTMLButtonElement).click();
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

    ((fixture.nativeElement as HTMLElement).querySelector('tbody button') as HTMLButtonElement).click();
    await fixture.whenStable();

    expect(toasts).toHaveLength(1);
    expect(toasts[0].severity).toBe('warn');
    expect(toasts[0].summary).toBe('You cannot deactivate yourself.');
  });
});
