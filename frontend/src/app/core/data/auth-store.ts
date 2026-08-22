import { HttpClient } from '@angular/common/http';
import { computed, inject, Service, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export type CurrentUser = {
  email: string;
  displayName: string;
  role: 'admin' | 'user';
  tenantName: string;
  hasAvatar: boolean;
};

/**
 * The signed-in user, mirroring the backend session (cookie-based). The session itself lives on
 * the server; this store only reflects it: the auth guard resolves it once per app start via
 * /api/auth/me, and the 401 interceptor clears it when the backend reports the session gone.
 */
@Service()
export class AuthStore {
  private readonly http = inject(HttpClient);

  private readonly user = signal<CurrentUser | null>(null);
  // Distinguishes "not signed in" from "not asked the backend yet".
  private readonly isSessionResolved = signal(false);

  // Bumped after avatar changes, so <img> caches never show a stale picture.
  private readonly avatarVersion = signal(0);

  readonly currentUser = this.user.asReadonly();
  readonly isAuthenticated = computed(() => this.user() !== null);
  /** URL of the signed-in user's profile picture, or null when there is none. */
  readonly avatarUrl = computed(() => (this.user()?.hasAvatar ? `/api/profile/avatar?v=${this.avatarVersion()}` : null));

  /** Resolves the session against the backend once; afterwards the stored answer is reused. */
  async resolveSession(): Promise<void> {
    if (this.isSessionResolved()) {
      return;
    }
    try {
      this.user.set(await firstValueFrom(this.http.get<CurrentUser>('/api/auth/me')));
    } catch {
      this.user.set(null);
    }
    this.isSessionResolved.set(true);
  }

  /** Returns whether the credentials were accepted. */
  async login(email: string, password: string): Promise<boolean> {
    try {
      const user = await firstValueFrom(this.http.post<CurrentUser>('/api/auth/login', { email, password }));
      this.user.set(user);
      this.isSessionResolved.set(true);
      return true;
    } catch {
      return false;
    }
  }

  async logout(): Promise<void> {
    try {
      await firstValueFrom(this.http.post<void>('/api/auth/logout', null));
    } catch {
      // The server session may already be gone; signing out locally is all that is left to do.
    }
    this.clearSession();
  }

  /** Re-reads the session user, e.g. after the profile page changed name or picture. */
  async refresh(): Promise<void> {
    try {
      this.user.set(await firstValueFrom(this.http.get<CurrentUser>('/api/auth/me')));
    } catch {
      // An expired session surfaces through the 401 interceptor; nothing to do here.
    }
  }

  /** Called after an avatar upload or removal, so every <img> re-fetches the picture. */
  bumpAvatarVersion(): void {
    this.avatarVersion.update((version) => version + 1);
  }

  /** Forgets the session locally, e.g. when a 401 reveals it expired on the server. */
  clearSession(): void {
    this.user.set(null);
    this.isSessionResolved.set(true);
  }
}
