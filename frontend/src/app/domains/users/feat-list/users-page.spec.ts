import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';

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
    createdAt: 'Member since',
    empty: 'No users found',
    loadError: 'Could not load users.',
  },
};

describe('UsersPage', () => {
  const users = signal<User[]>([]);
  const error = signal<Error | undefined>(undefined);
  const usersServiceStub = { users: { value: users, error } } as unknown as UsersService;

  beforeEach(async () => {
    users.set([]);
    error.set(undefined);
    await TestBed.configureTestingModule({
      imports: [
        UsersPage,
        TranslocoTestingModule.forRoot({
          langs: { en: translations },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
      providers: [provideZonelessChangeDetection(), { provide: UsersService, useValue: usersServiceStub }],
    }).compileComponents();
  });

  it('shows the title and the users from the service', () => {
    users.set([
      {
        id: '1',
        email: 'anna@musterfirma.example',
        displayName: 'Anna Admin',
        role: 'admin',
        createdAt: '2026-08-01T10:00:00Z',
      },
    ]);
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
});
