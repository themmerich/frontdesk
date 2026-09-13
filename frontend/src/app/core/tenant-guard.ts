import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthStore } from '../shared/data/auth-store';

/**
 * Protects the pages that are about a tenant — the cases, the profile. A super-user with no
 * tenant open would only see a wall of 403s there, so they are sent to the Mandanten page, the
 * one place that needs none.
 */
export const tenantGuard: CanActivateFn = async () => {
  const authStore = inject(AuthStore);
  const router = inject(Router);

  await authStore.resolveSession();
  return authStore.hasTenant() ? true : router.createUrlTree(['/tenants']);
};
