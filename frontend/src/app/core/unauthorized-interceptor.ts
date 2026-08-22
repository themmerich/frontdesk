import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { tap } from 'rxjs';

import { AuthStore } from './data/auth-store';

/**
 * When any API call answers 401, the server session has expired: forget it locally and return
 * to the login page. The auth endpoints are exempt — a failed login attempt and the guard's own
 * session probe answer 401 as part of their normal protocol.
 */
export const unauthorizedInterceptor: HttpInterceptorFn = (request, next) => {
  const authStore = inject(AuthStore);
  const router = inject(Router);

  return next(request).pipe(
    tap({
      error: (error: unknown) => {
        if (error instanceof HttpErrorResponse && error.status === 401 && !request.url.includes('/api/auth/')) {
          authStore.clearSession();
          void router.navigate(['/login']);
        }
      },
    }),
  );
};
