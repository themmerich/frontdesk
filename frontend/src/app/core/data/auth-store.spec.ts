import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { AuthStore, CurrentUser } from './auth-store';

const musterfirma = { slug: 'musterfirma', name: 'Musterfirma GmbH' };

const user: CurrentUser = {
  username: 'admin',
  displayName: 'Anna Admin',
  role: 'admin',
  tenant: musterfirma,
  hasAvatar: false,
};

const superuser: CurrentUser = {
  username: 'super',
  displayName: 'Sina Super',
  role: 'superuser',
  tenant: null,
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
    expect(store.hasTenant()).toBe(false);
    expect(store.canAdminister()).toBe(false);
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

  it('signs in to a tenant with its Kennung', async () => {
    const login = store.login(' Musterfirma ', 'admin', 'secret');
    const request = http.expectOne('/api/auth/login');
    // Trimmed; the backend lower-cases it.
    expect(request.request.body).toEqual({ tenant: 'Musterfirma', username: 'admin', password: 'secret' });
    request.flush(user);

    expect(await login).toBe(true);
    expect(store.currentUser()).toEqual(user);
    expect(store.hasTenant()).toBe(true);
    expect(store.canAdminister()).toBe(true);
    expect(store.isSuperuser()).toBe(false);
  });

  it('signs in as a super-user without a Kennung', async () => {
    const login = store.login('', 'super', 'secret');
    const request = http.expectOne('/api/auth/login');
    expect(request.request.body).toEqual({ tenant: null, username: 'super', password: 'secret' });
    request.flush(superuser);

    expect(await login).toBe(true);
    expect(store.isSuperuser()).toBe(true);
    expect(store.hasTenant()).toBe(false);
    // Nothing to administer while no tenant is open.
    expect(store.canAdminister()).toBe(false);
  });

  it('opens and closes a tenant for a super-user', async () => {
    const login = store.login('', 'super', 'secret');
    http.expectOne('/api/auth/login').flush(superuser);
    await login;

    const open = store.openTenant('musterfirma');
    const put = http.expectOne('/api/auth/tenant');
    expect(put.request.method).toBe('PUT');
    expect(put.request.body).toEqual({ slug: 'musterfirma' });
    put.flush({ ...superuser, tenant: musterfirma });
    await open;
    expect(store.hasTenant()).toBe(true);
    expect(store.canAdminister()).toBe(true);

    const close = store.closeTenant();
    const del = http.expectOne('/api/auth/tenant');
    expect(del.request.method).toBe('DELETE');
    del.flush(superuser);
    await close;
    expect(store.hasTenant()).toBe(false);
  });

  it('reports rejected credentials without signing in', async () => {
    const login = store.login('musterfirma', 'admin', 'wrong');
    http.expectOne('/api/auth/login').flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(await login).toBe(false);
    expect(store.isAuthenticated()).toBe(false);
  });

  it('signs out locally even when the server session is already gone', async () => {
    const login = store.login('musterfirma', 'admin', 'secret');
    http.expectOne('/api/auth/login').flush(user);
    await login;

    const logout = store.logout();
    http.expectOne('/api/auth/logout').flush(null, { status: 401, statusText: 'Unauthorized' });
    await logout;

    expect(store.isAuthenticated()).toBe(false);
    expect(store.currentUser()).toBeNull();
  });
});
