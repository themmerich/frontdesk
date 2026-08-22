import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthStore } from './data/auth-store';

/**
 * Protects admin-only routes: regular users are sent back to the start page. The backend
 * enforces the role as well — this guard only spares users a page they could not use.
 */
export const adminGuard: CanActivateFn = async () => {
  const authStore = inject(AuthStore);
  const router = inject(Router);

  await authStore.resolveSession();
  return authStore.currentUser()?.role === 'admin' ? true : router.createUrlTree(['/']);
};
