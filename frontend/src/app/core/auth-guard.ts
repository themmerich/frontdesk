import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthStore } from './data/auth-store';

/**
 * Protects the shell routes: resolves the session on first navigation and sends anonymous
 * visitors to the login page, remembering where they wanted to go.
 */
export const authGuard: CanActivateFn = async (_route, state) => {
  const authStore = inject(AuthStore);
  const router = inject(Router);

  await authStore.resolveSession();
  if (authStore.isAuthenticated()) {
    return true;
  }
  const returnUrl = state.url === '/' ? {} : { returnUrl: state.url };
  return router.createUrlTree(['/login'], { queryParams: returnUrl });
};
