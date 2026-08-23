import { HttpClient } from '@angular/common/http';
import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { firstValueFrom } from 'rxjs';

export type CurrentUser = {
  username: string;
  displayName: string;
  role: 'admin' | 'user';
  tenantName: string;
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
  })),
  withMethods((store) => {
    const http = inject(HttpClient);

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

      /** Returns whether the credentials were accepted. */
      async login(username: string, password: string): Promise<boolean> {
        try {
          const currentUser = await firstValueFrom(http.post<CurrentUser>('/api/auth/login', { username, password }));
          patchState(store, { currentUser, _isSessionResolved: true });
          return true;
        } catch {
          return false;
        }
      },

      async logout(): Promise<void> {
        try {
          await firstValueFrom(http.post<void>('/api/auth/logout', null));
        } catch {
          // The server session may already be gone; signing out locally is all that is left to do.
        }
        clearSession();
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
