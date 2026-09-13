import { computed, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, provideRouter, RouterStateSnapshot } from '@angular/router';

import { AuthStore, CurrentUser } from '../shared/data/auth-store';
import { superuserGuard } from './superuser-guard';

const musterfirma = { slug: 'musterfirma', name: 'Musterfirma GmbH' };

describe('superuserGuard', () => {
  const currentUser = signal<CurrentUser | null>(null);
  const authStoreStub = {
    currentUser,
    isSuperuser: computed(() => currentUser()?.role === 'superuser'),
    resolveSession: () => Promise.resolve(),
  } as unknown as AuthStore;

  beforeEach(() => {
    currentUser.set(null);
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter([]), { provide: AuthStore, useValue: authStoreStub }],
    });
  });

  async function runGuard() {
    return TestBed.runInInjectionContext(() => superuserGuard({} as ActivatedRouteSnapshot, { url: '/tenants' } as RouterStateSnapshot));
  }

  it('lets super-users pass, with or without a tenant open', async () => {
    currentUser.set({ username: 'sina', displayName: 'Sina', role: 'superuser', tenant: null, hasAvatar: false });
    expect(await runGuard()).toBe(true);

    currentUser.set({ username: 'sina', displayName: 'Sina', role: 'superuser', tenant: musterfirma, hasAvatar: false });
    expect(await runGuard()).toBe(true);
  });

  it('sends admins and users back to the start page', async () => {
    currentUser.set({ username: 'anna', displayName: 'Anna', role: 'admin', tenant: musterfirma, hasAvatar: false });
    expect(String(await runGuard())).toBe('/');

    currentUser.set({ username: 'uwe', displayName: 'Uwe', role: 'user', tenant: musterfirma, hasAvatar: false });
    expect(String(await runGuard())).toBe('/');
  });
});
