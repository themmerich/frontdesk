import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';

import { AuthStore } from '../shared/data/auth-store';

/** Protects the Mandanten area: super-users only, everyone else goes back to the start page. */
export const superuserGuard: CanActivateFn = async () => {
  const authStore = inject(AuthStore);
  const router = inject(Router);

  await authStore.resolveSession();
  return authStore.isSuperuser() ? true : router.createUrlTree(['/']);
};
