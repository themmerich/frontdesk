import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject, linkedSignal, signal, viewChild, ElementRef } from '@angular/core';
import { form, FormField, minLength, required, submit, validate } from '@angular/forms/signals';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';
import { AvatarModule } from 'primeng/avatar';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';

import { AuthStore } from '../data/auth-store';
import { ProfileStore } from '../data/profile-store';

const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

type PasswordChange = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

/** The signed-in user's own profile: picture, display name, and password. */
@Component({
  selector: 'app-profile-page',
  imports: [FormField, TranslocoDirective, AvatarModule, ButtonModule, InputTextModule, MessageModule],
  templateUrl: './profile-page.html',
})
export class ProfilePage {
  protected readonly authStore = inject(AuthStore);
  private readonly profileStore = inject(ProfileStore);
  private readonly messageService = inject(MessageService);
  private readonly transloco = inject(TranslocoService);

  private readonly fileInput = viewChild.required<ElementRef<HTMLInputElement>>('fileInput');

  // Re-anchors on the stored name whenever the session user refreshes.
  protected readonly name = linkedSignal(() => ({ displayName: this.authStore.currentUser()?.displayName ?? '' }));
  protected readonly nameForm = form(this.name, (schemaPath) => {
    required(schemaPath.displayName);
  });

  protected readonly passwordChange = signal<PasswordChange>({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  protected readonly passwordForm = form(this.passwordChange, (schemaPath) => {
    required(schemaPath.currentPassword);
    required(schemaPath.newPassword);
    minLength(schemaPath.newPassword, 8);
    required(schemaPath.confirmPassword);
    validate(schemaPath.confirmPassword, ({ value, valueOf }) =>
      value() === valueOf(schemaPath.newPassword) ? null : { kind: 'mismatch' },
    );
  });

  protected readonly isSavingName = signal(false);
  protected readonly isChangingPassword = signal(false);
  protected readonly isSavingAvatar = signal(false);
  // Validation errors stay hidden until the field was visited or a submit was
  // attempted — submit() alone does not flip the fields' touched state.
  protected readonly hasNameSubmitAttempted = signal(false);
  protected readonly hasPasswordSubmitAttempted = signal(false);

  protected onPickFile(): void {
    this.fileInput().nativeElement.click();
  }

  protected async onFileSelected(): Promise<void> {
    const input = this.fileInput().nativeElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    if (!ALLOWED_IMAGE_TYPES.includes(file.type) || file.size > MAX_IMAGE_BYTES) {
      this.toast('warn', 'profile.imageInvalid');
      return;
    }
    this.isSavingAvatar.set(true);
    try {
      await this.profileStore.uploadAvatar(file);
      this.toast('success', 'profile.pictureSaved');
    } catch {
      this.toast('error', 'profile.error');
    } finally {
      this.isSavingAvatar.set(false);
    }
  }

  protected async onRemovePicture(): Promise<void> {
    this.isSavingAvatar.set(true);
    try {
      await this.profileStore.removeAvatar();
      this.toast('success', 'profile.pictureRemoved');
    } catch {
      this.toast('error', 'profile.error');
    } finally {
      this.isSavingAvatar.set(false);
    }
  }

  protected async onSaveName(event: Event): Promise<void> {
    event.preventDefault();
    this.hasNameSubmitAttempted.set(true);
    await submit(this.nameForm, async () => {
      this.isSavingName.set(true);
      try {
        await this.profileStore.rename(this.name().displayName.trim());
        this.hasNameSubmitAttempted.set(false);
        this.toast('success', 'profile.nameSaved');
      } catch {
        this.toast('error', 'profile.error');
      } finally {
        this.isSavingName.set(false);
      }
    });
  }

  protected async onChangePassword(event: Event): Promise<void> {
    event.preventDefault();
    this.hasPasswordSubmitAttempted.set(true);
    await submit(this.passwordForm, async () => {
      this.isChangingPassword.set(true);
      try {
        const { currentPassword, newPassword } = this.passwordChange();
        await this.profileStore.changePassword(currentPassword, newPassword);
        this.passwordChange.set({ currentPassword: '', newPassword: '', confirmPassword: '' });
        this.hasPasswordSubmitAttempted.set(false);
        this.toast('success', 'profile.passwordChanged');
      } catch (error) {
        // The backend answers 400 when the current password does not match.
        const isWrongPassword = error instanceof HttpErrorResponse && error.status === 400;
        this.toast(isWrongPassword ? 'warn' : 'error', isWrongPassword ? 'profile.passwordWrong' : 'profile.error');
      } finally {
        this.isChangingPassword.set(false);
      }
    });
  }

  private toast(severity: 'success' | 'warn' | 'error', translationKey: string): void {
    this.messageService.add({ severity, summary: this.transloco.translate(translationKey) });
  }
}
