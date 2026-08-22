import { HttpClient } from '@angular/common/http';
import { computed, inject, Service, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';

export type CurrentUser = {
  email: string;
  displayName: string;
  role: 'admin' | 'user';
  tenantName: string;
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

  readonly currentUser = this.user.asReadonly();
  readonly isAuthenticated = computed(() => this.user() !== null);

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

  /** Forgets the session locally, e.g. when a 401 reveals it expired on the server. */
  clearSession(): void {
    this.user.set(null);
    this.isSessionResolved.set(true);
  }
}
