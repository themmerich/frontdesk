import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, linkedSignal, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { email, form, FormField, minLength, required, submit, validate } from '@angular/forms/signals';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';
import { AvatarModule } from 'primeng/avatar';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { FieldsetModule } from 'primeng/fieldset';
import { FileUpload, FileUploadHandlerEvent, FileUploadModule } from 'primeng/fileupload';
import { FloatLabelModule } from 'primeng/floatlabel';
import { InputGroupModule } from 'primeng/inputgroup';
import { InputGroupAddonModule } from 'primeng/inputgroupaddon';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TooltipModule } from 'primeng/tooltip';

import { BranchService } from '../../shared/data/branch-service';
import { AuthStore } from '../data/auth-store';
import { Profile, ProfileService } from '../data/profile-service';

const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

type ProfileFormModel = {
  firstName: string;
  lastName: string;
  /** Datepicker values; null while no date is picked. */
  birthDate: Date | null;
  joinedAt: Date | null;
  /** Dropdown choice; null while no site is picked. */
  branchId: string | null;
  email: string;
  phone: string;
  fax: string;
};

type PasswordChange = {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
};

/** Parses an ISO date (yyyy-MM-dd) into a local Date, so the datepicker shows the stored day. */
function parseIsoDate(value: string | null): Date | null {
  if (value === null) {
    return null;
  }
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** Formats a local Date as an ISO date (yyyy-MM-dd) — no UTC detour, no timezone shift. */
function toIsoDate(date: Date | null): string | null {
  if (date === null) {
    return null;
  }
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function toFormModel(profile: Profile | null): ProfileFormModel {
  return {
    firstName: profile?.firstName ?? '',
    lastName: profile?.lastName ?? '',
    birthDate: parseIsoDate(profile?.birthDate ?? null),
    joinedAt: parseIsoDate(profile?.joinedAt ?? null),
    branchId: profile?.branchId ?? null,
    email: profile?.email ?? '',
    phone: profile?.phone ?? '',
    fax: profile?.fax ?? '',
  };
}

/** The signed-in user's own profile: picture, personal data, contact data, and password. */
@Component({
  selector: 'app-profile-page',
  imports: [
    FormField,
    TranslocoDirective,
    AvatarModule,
    ButtonModule,
    DatePickerModule,
    FieldsetModule,
    FileUploadModule,
    FloatLabelModule,
    InputGroupModule,
    InputGroupAddonModule,
    InputTextModule,
    MessageModule,
    SelectModule,
    TooltipModule,
  ],
  templateUrl: './profile-page.html',
})
export class ProfilePage {
  protected readonly authStore = inject(AuthStore);
  protected readonly profileService = inject(ProfileService);
  private readonly branchService = inject(BranchService);
  private readonly messageService = inject(MessageService);
  private readonly transloco = inject(TranslocoService);

  private readonly avatarUpload = viewChild.required(FileUpload);

  // Re-anchors on the loaded (or freshly saved) profile, while staying freely editable in between.
  protected readonly model = linkedSignal(() => toFormModel(this.profileService.profile.value()));
  protected readonly profileForm = form(this.model, (schemaPath) => {
    required(schemaPath.firstName);
    required(schemaPath.lastName);
    email(schemaPath.email);
  });

  // Re-evaluates the options once the active translation file (re)loads.
  private readonly translation = toSignal(this.transloco.selectTranslation());
  /** The company's sites; the headquarters is marked so the dropdown reads unambiguously. */
  protected readonly branchOptions = computed<{ label: string; value: string }[]>(() => {
    this.translation();
    return this.branchService.branches.value().map((branch) => ({
      label: branch.headquarters ? `${branch.name} (${this.transloco.translate('profile.headquarters')})` : branch.name,
      value: branch.id,
    }));
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

  protected readonly isSaving = signal(false);
  protected readonly isChangingPassword = signal(false);
  protected readonly isSavingAvatar = signal(false);
  // Validation errors stay hidden until the field was visited or a submit was
  // attempted — submit() alone does not flip the fields' touched state.
  protected readonly hasSubmitAttempted = signal(false);
  protected readonly hasPasswordSubmitAttempted = signal(false);

  /** Called by the upload widget right after a file was chosen (auto mode). */
  protected async onUploadAvatar(event: FileUploadHandlerEvent): Promise<void> {
    const file = event.files[0] as File | undefined;
    // The widget keeps the chosen file; clear it so the next pick fires again.
    this.avatarUpload().clear();
    if (!file) {
      return;
    }
    if (!ALLOWED_IMAGE_TYPES.includes(file.type) || file.size > MAX_IMAGE_BYTES) {
      this.toast('warn', 'profile.imageInvalid');
      return;
    }
    this.isSavingAvatar.set(true);
    try {
      await this.profileService.uploadAvatar(file);
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
      await this.profileService.removeAvatar();
      this.toast('success', 'profile.pictureRemoved');
    } catch {
      this.toast('error', 'profile.error');
    } finally {
      this.isSavingAvatar.set(false);
    }
  }

  protected async onSave(event: Event): Promise<void> {
    event.preventDefault();
    this.hasSubmitAttempted.set(true);
    await submit(this.profileForm, async () => {
      this.isSaving.set(true);
      try {
        const model = this.model();
        await this.profileService.save({
          firstName: model.firstName.trim(),
          lastName: model.lastName.trim(),
          birthDate: toIsoDate(model.birthDate),
          joinedAt: toIsoDate(model.joinedAt),
          branchId: model.branchId,
          email: model.email,
          phone: model.phone,
          fax: model.fax,
        });
        this.hasSubmitAttempted.set(false);
        // Back to pristine: the save button stays disabled until the next edit.
        this.profileForm().reset();
        this.toast('success', 'profile.saved');
      } catch {
        this.toast('error', 'profile.error');
      } finally {
        this.isSaving.set(false);
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
        await this.profileService.changePassword(currentPassword, newPassword);
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
