import { computed, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, provideRouter, RouterStateSnapshot, UrlTree } from '@angular/router';

import { adminGuard } from './admin-guard';
import { AuthStore, CurrentUser } from '../shared/data/auth-store';

const musterfirma = { slug: 'musterfirma', name: 'Musterfirma GmbH' };

describe('adminGuard', () => {
  const currentUser = signal<CurrentUser | null>(null);
  const authStoreStub = {
    currentUser,
    canAdminister: computed(() => {
      const user = currentUser();
      return user?.role === 'admin' || (user?.role === 'superuser' && user.tenant !== null);
    }),
    resolveSession: () => Promise.resolve(),
  } as unknown as AuthStore;

  beforeEach(() => {
    currentUser.set(null);
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter([]), { provide: AuthStore, useValue: authStoreStub }],
    });
  });

  async function runGuard() {
    return TestBed.runInInjectionContext(() => adminGuard({} as ActivatedRouteSnapshot, { url: '/settings' } as RouterStateSnapshot));
  }

  it('lets admins pass', async () => {
    currentUser.set({ username: 'anna', displayName: 'Anna', role: 'admin', tenant: musterfirma, hasAvatar: false });

    expect(await runGuard()).toBe(true);
  });

  it('lets a super-user pass once a tenant is open, and not before', async () => {
    currentUser.set({ username: 'sina', displayName: 'Sina', role: 'superuser', tenant: musterfirma, hasAvatar: false });
    expect(await runGuard()).toBe(true);

    currentUser.set({ username: 'sina', displayName: 'Sina', role: 'superuser', tenant: null, hasAvatar: false });
    expect(String(await runGuard())).toBe('/');
  });

  it('sends regular users back to the start page', async () => {
    currentUser.set({ username: 'uwe', displayName: 'Uwe', role: 'user', tenant: musterfirma, hasAvatar: false });

    const result = await runGuard();

    expect(result).toBeInstanceOf(UrlTree);
    expect(String(result)).toBe('/');
  });
});
