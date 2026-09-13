import { computed, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, provideRouter, RouterStateSnapshot } from '@angular/router';

import { AuthStore, CurrentUser } from './data/auth-store';
import { tenantGuard } from './tenant-guard';

const musterfirma = { slug: 'musterfirma', name: 'Musterfirma GmbH' };

describe('tenantGuard', () => {
  const currentUser = signal<CurrentUser | null>(null);
  const authStoreStub = {
    currentUser,
    hasTenant: computed(() => (currentUser()?.tenant ?? null) !== null),
    resolveSession: () => Promise.resolve(),
  } as unknown as AuthStore;

  beforeEach(() => {
    currentUser.set(null);
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideRouter([]), { provide: AuthStore, useValue: authStoreStub }],
    });
  });

  async function runGuard() {
    return TestBed.runInInjectionContext(() => tenantGuard({} as ActivatedRouteSnapshot, { url: '/' } as RouterStateSnapshot));
  }

  it('lets everyone with a tenant pass', async () => {
    currentUser.set({ username: 'uwe', displayName: 'Uwe', role: 'user', tenant: musterfirma, hasAvatar: false });
    expect(await runGuard()).toBe(true);

    currentUser.set({ username: 'sina', displayName: 'Sina', role: 'superuser', tenant: musterfirma, hasAvatar: false });
    expect(await runGuard()).toBe(true);
  });

  it('sends a super-user without a tenant to the tenants page', async () => {
    currentUser.set({ username: 'sina', displayName: 'Sina', role: 'superuser', tenant: null, hasAvatar: false });

    expect(String(await runGuard())).toBe('/tenants');
  });
});
