import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, provideRouter, RouterStateSnapshot, UrlTree } from '@angular/router';

import { adminGuard } from './admin-guard';
import { AuthStore, CurrentUser } from './data/auth-store';

describe('adminGuard', () => {
  const currentUser = signal<CurrentUser | null>(null);
  const authStoreStub = { currentUser, resolveSession: () => Promise.resolve() } as unknown as AuthStore;

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
    currentUser.set({ email: 'a@b.c', displayName: 'Anna', role: 'admin', tenantName: 'Musterfirma GmbH', hasAvatar: false });

    expect(await runGuard()).toBe(true);
  });

  it('sends regular users back to the start page', async () => {
    currentUser.set({ email: 'u@b.c', displayName: 'Uwe', role: 'user', tenantName: 'Musterfirma GmbH', hasAvatar: false });

    const result = await runGuard();

    expect(result).toBeInstanceOf(UrlTree);
    expect(String(result)).toBe('/');
  });
});
