import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { AuthStore, CurrentUser } from './auth-store';

const user: CurrentUser = {
  email: 'admin@frontdesk.local',
  displayName: 'Anna Admin',
  role: 'admin',
  tenantName: 'Musterfirma GmbH',
  hasAvatar: false,
};

describe('AuthStore', () => {
  let store: AuthStore;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting()],
    });
    store = TestBed.inject(AuthStore);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('starts unauthenticated', () => {
    expect(store.isAuthenticated()).toBe(false);
    expect(store.currentUser()).toBeNull();
  });

  it('resolves an existing session from the backend once', async () => {
    const resolve = store.resolveSession();
    http.expectOne('/api/auth/me').flush(user);
    await resolve;

    expect(store.isAuthenticated()).toBe(true);
    expect(store.currentUser()).toEqual(user);

    // A second call reuses the answer instead of asking again.
    await store.resolveSession();
    http.expectNone('/api/auth/me');
  });

  it('stays anonymous when the backend answers 401', async () => {
    const resolve = store.resolveSession();
    http.expectOne('/api/auth/me').flush(null, { status: 401, statusText: 'Unauthorized' });
    await resolve;

    expect(store.isAuthenticated()).toBe(false);
  });

  it('signs in with accepted credentials', async () => {
    const login = store.login('admin@frontdesk.local', 'secret');
    const request = http.expectOne('/api/auth/login');
    expect(request.request.body).toEqual({ email: 'admin@frontdesk.local', password: 'secret' });
    request.flush(user);

    expect(await login).toBe(true);
    expect(store.currentUser()).toEqual(user);
  });

  it('reports rejected credentials without signing in', async () => {
    const login = store.login('admin@frontdesk.local', 'wrong');
    http.expectOne('/api/auth/login').flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(await login).toBe(false);
    expect(store.isAuthenticated()).toBe(false);
  });

  it('signs out locally even when the server session is already gone', async () => {
    const login = store.login('admin@frontdesk.local', 'secret');
    http.expectOne('/api/auth/login').flush(user);
    await login;

    const logout = store.logout();
    http.expectOne('/api/auth/logout').flush(null, { status: 401, statusText: 'Unauthorized' });
    await logout;

    expect(store.isAuthenticated()).toBe(false);
    expect(store.currentUser()).toBeNull();
  });
});
