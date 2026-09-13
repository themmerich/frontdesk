import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthStore } from '../shared/data/auth-store';

/**
 * Protects a tenant's administration: its admins pass, and a super-user who has the tenant open.
 * Everyone else is sent back to the start page. The backend enforces the role as well — this
 * guard only spares people a page they could not use.
 */
export const adminGuard: CanActivateFn = async () => {
  const authStore = inject(AuthStore);
  const router = inject(Router);

  await authStore.resolveSession();
  return authStore.canAdminister() ? true : router.createUrlTree(['/']);
};
