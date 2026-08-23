import { HttpClient, httpResource } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { AuthStore } from './auth-store';

/** The signed-in user's own profile, as served and stored by the backend. Dates are ISO strings. */
export type Profile = {
  /** The login name: any string, unique within the tenant — not necessarily a mail address. */
  username: string;
  firstName: string;
  lastName: string;
  birthDate: string | null;
  /** The day the user joined the company (Eintrittsdatum). */
  joinedAt: string | null;
  /** Free text until companies grow branches — then this becomes a dropdown choice. */
  company: string | null;
  /** Contact address only; the login name is the username above. */
  email: string | null;
  phone: string | null;
  fax: string | null;
};

/** Everything the user may change; the username stays read-only for now. */
export type ProfileUpdate = Omit<Profile, 'username'>;

/**
 * Reads and writes the signed-in user's own profile. Every mutation refreshes the AuthStore, so
 * the sidebar and navbar reflect the change immediately. Errors propagate to the caller — the
 * page turns them into toasts (and distinguishes the wrong-current-password 400).
 */
@Service()
export class ProfileService {
  private readonly http = inject(HttpClient);
  private readonly authStore = inject(AuthStore);

  readonly profile = httpResource<Profile | null>(() => '/api/profile', { defaultValue: null });

  /** Saves and reflects the server's answer in the resource, so the page shows the stored state. */
  async save(update: ProfileUpdate): Promise<void> {
    const saved = await firstValueFrom(this.http.put<Profile>('/api/profile', update));
    this.profile.set(saved);
    await this.authStore.refresh();
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await firstValueFrom(this.http.put<void>('/api/profile/password', { currentPassword, newPassword }));
  }

  async uploadAvatar(file: File): Promise<void> {
    const formData = new FormData();
    formData.append('file', file);
    await firstValueFrom(this.http.put<void>('/api/profile/avatar', formData));
    await this.authStore.refresh();
    this.authStore.bumpAvatarVersion();
  }

  async removeAvatar(): Promise<void> {
    await firstValueFrom(this.http.delete<void>('/api/profile/avatar'));
    await this.authStore.refresh();
    this.authStore.bumpAvatarVersion();
  }
}
