import { HttpClient } from '@angular/common/http';
import { computed, inject, Injector } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { firstValueFrom } from 'rxjs';

import { CompanyService } from './company-service';

/** The tenant a session is about, as the sidebar and the guards need it. */
export type CurrentTenant = {
  /** The Kennung, what the login page asks for. */
  slug: string;
  name: string;
};

export type CurrentUser = {
  username: string;
  displayName: string;
  role: 'admin' | 'user' | 'superuser';
  /** A tenant user's own tenant; a super-user's opened one, or null while none is open. */
  tenant: CurrentTenant | null;
  hasAvatar: boolean;
};

type AuthState = {
  currentUser: CurrentUser | null;
  // Distinguishes "not signed in" from "not asked the backend yet".
  _isSessionResolved: boolean;
  // Bumped after avatar changes, so <img> caches never show a stale picture.
  _avatarVersion: number;
};

const initialState: AuthState = {
  currentUser: null,
  _isSessionResolved: false,
  _avatarVersion: 0,
};

/**
 * The signed-in user, mirroring the backend session (cookie-based). The session itself lives on
 * the server; this store only reflects it: the auth guard resolves it once per app start via
 * /api/auth/me, and the 401 interceptor clears it when the backend reports the session gone.
 */
export const AuthStore = signalStore(
  { providedIn: 'root' },
  withState(initialState),
  withComputed(({ currentUser, _avatarVersion }) => ({
    isAuthenticated: computed(() => currentUser() !== null),
    /** URL of the signed-in user's profile picture, or null when there is none. */
    avatarUrl: computed(() => (currentUser()?.hasAvatar ? `/api/profile/avatar?v=${_avatarVersion()}` : null)),
    isSuperuser: computed(() => currentUser()?.role === 'superuser'),
    /** Whether the session is about a tenant: always for tenant users, for super-users once one is open. */
    hasTenant: computed(() => (currentUser()?.tenant ?? null) !== null),
    /** Who sees a tenant's administration: its admins, and a super-user who has it open. */
    canAdminister: computed(() => {
      const user = currentUser();
      return user?.role === 'admin' || (user?.role === 'superuser' && user.tenant !== null);
    }),
  })),
  withMethods((store) => {
    const http = inject(HttpClient);
    // Resolved when needed rather than up front: the company service reads /api/company the
    // moment it exists, which on the login page would only earn a 401.
    const injector = inject(Injector);
    const brand = () => injector.get(CompanyService);

    /** Forgets the session locally, e.g. when a 401 reveals it expired on the server. */
    function clearSession(): void {
      patchState(store, { currentUser: null, _isSessionResolved: true });
    }

    return {
      clearSession,

      /** Resolves the session against the backend once; afterwards the stored answer is reused. */
      async resolveSession(): Promise<void> {
        if (store._isSessionResolved()) {
          return;
        }
        try {
          patchState(store, { currentUser: await firstValueFrom(http.get<CurrentUser>('/api/auth/me')) });
        } catch {
          patchState(store, { currentUser: null });
        }
        patchState(store, { _isSessionResolved: true });
      },

      /**
       * Returns whether the credentials were accepted.
       *
       * @param tenant the Kennung of the tenant to sign in to; blank means a super-user is signing in
       */
      async login(tenant: string, username: string, password: string): Promise<boolean> {
        try {
          // A logout clears the CSRF cookie and the login page makes no request of its own, so
          // the first POST would go out without a token. This empty call brings one.
          await firstValueFrom(http.get<void>('/api/auth/csrf'));
          const body = { tenant: tenant.trim() || null, username, password };
          const currentUser = await firstValueFrom(http.post<CurrentUser>('/api/auth/login', body));
          patchState(store, { currentUser, _isSessionResolved: true });
          // The brand follows the session: whoever signed in, their company — or frontdesk's own.
          brand().reload();
          return true;
        } catch {
          return false;
        }
      },

      /** A super-user opens a tenant: the session is about it from here on. */
      async openTenant(slug: string): Promise<void> {
        patchState(store, { currentUser: await firstValueFrom(http.put<CurrentUser>('/api/auth/tenant', { slug })) });
        brand().reload();
      },

      /** Back to the plain super-user view. */
      async closeTenant(): Promise<void> {
        patchState(store, { currentUser: await firstValueFrom(http.delete<CurrentUser>('/api/auth/tenant')) });
        brand().reload();
      },

      async logout(): Promise<void> {
        try {
          await firstValueFrom(http.post<void>('/api/auth/logout', null));
        } catch {
          // The server session may already be gone; signing out locally is all that is left to do.
        }
        clearSession();
        // The next person at this browser may belong to another company.
        brand().clear();
      },

      /** Re-reads the session user, e.g. after the profile page changed name or picture. */
      async refresh(): Promise<void> {
        try {
          patchState(store, { currentUser: await firstValueFrom(http.get<CurrentUser>('/api/auth/me')) });
        } catch {
          // An expired session surfaces through the 401 interceptor; nothing to do here.
        }
      },

      /** Called after an avatar upload or removal, so every <img> re-fetches the picture. */
      bumpAvatarVersion(): void {
        patchState(store, ({ _avatarVersion }) => ({ _avatarVersion: _avatarVersion + 1 }));
      },
    };
  }),
);

/** Instance type of the store, so consumers and test stubs can use `AuthStore` as a type. */
export type AuthStore = InstanceType<typeof AuthStore>;
