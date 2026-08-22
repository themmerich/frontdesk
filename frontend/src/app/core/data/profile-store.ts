import { HttpClient } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { AuthStore, CurrentUser } from './auth-store';

/**
 * Writes to the signed-in user's own profile. Every mutation refreshes the AuthStore, so the
 * sidebar and navbar reflect the change immediately. Errors propagate to the caller — the page
 * turns them into toasts (and distinguishes the wrong-current-password 400).
 */
@Service()
export class ProfileStore {
  private readonly http = inject(HttpClient);
  private readonly authStore = inject(AuthStore);

  async rename(displayName: string): Promise<void> {
    await firstValueFrom(this.http.put<CurrentUser>('/api/profile', { displayName }));
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
