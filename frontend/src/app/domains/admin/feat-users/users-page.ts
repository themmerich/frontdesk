import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ChildFieldContext, form, FormField, minLength, required, submit } from '@angular/forms/signals';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { DialogModule } from 'primeng/dialog';
import { FloatLabelModule } from 'primeng/floatlabel';
import { InputGroupModule } from 'primeng/inputgroup';
import { InputGroupAddonModule } from 'primeng/inputgroupaddon';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { TooltipModule } from 'primeng/tooltip';

import { BranchService } from '../../../shared/data/branch-service';
import { CompanyService } from '../../../shared/data/company-service';
import { UserColumnsService } from '../data/user-columns-service';
import { UsersService } from '../data/users-service';
import { User, UserUpdate } from '../model/user';
import { UserList } from '../ui/user-list';

type UserFormModel = {
  username: string;
  firstName: string;
  lastName: string;
  /** The initial password; the new user changes it on their profile page. */
  password: string;
  /** Dropdown choice; null while no site is picked. */
  branchId: string | null;
  role: User['role'];
  active: boolean;
};

/** Without the look-alikes 0/O and 1/l/I, so a dictated password arrives intact. */
const PASSWORD_ALPHABET = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const GENERATED_PASSWORD_LENGTH = 12;

/** A fresh, empty form: an ordinary user who may sign in right away. */
function emptyFormModel(): UserFormModel {
  return { username: '', firstName: '', lastName: '', password: '', branchId: null, role: 'user', active: true };
}

/** The stored user, ready to be edited; the password field stays out of the dialog. */
function toFormModel(user: User): UserFormModel {
  return {
    username: user.username,
    firstName: user.firstName,
    lastName: user.lastName,
    password: '',
    branchId: user.branchId,
    role: user.role,
    active: user.active,
  };
}

/** All users of the signed-in admin's tenant; admins add them and activate and deactivate them. */
@Component({
  selector: 'app-users-page',
  imports: [
    FormField,
    TranslocoDirective,
    ButtonModule,
    CheckboxModule,
    DialogModule,
    FloatLabelModule,
    InputGroupModule,
    InputGroupAddonModule,
    InputTextModule,
    MessageModule,
    SelectModule,
    TooltipModule,
    UserList,
  ],
  templateUrl: './users-page.html',
})
export class UsersPage {
  protected readonly usersService = inject(UsersService);
  protected readonly columnsService = inject(UserColumnsService);
  protected readonly companyService = inject(CompanyService);
  private readonly branchService = inject(BranchService);
  private readonly messageService = inject(MessageService);
  private readonly transloco = inject(TranslocoService);

  /** The user being edited in the dialog, or null while it creates a new one. */
  protected readonly editingUserId = signal<string | null>(null);
  protected readonly isDialogVisible = signal(false);
  protected readonly isSaving = signal(false);
  // A save attempt judges every field at once — submit() alone does not flip
  // the fields' touched state.
  protected readonly hasSubmitAttempted = signal(false);
  /** The generated password shows in the clear, so the admin can pass it on. */
  protected readonly isPasswordVisible = signal(false);

  // A field is only judged once the admin edited it, or once they tried to
  // save. PrimeNG marks an invalid field red the moment it is bound, so
  // without this a freshly opened dialog would greet them all in red.
  private readonly whenEdited = ({ state }: ChildFieldContext<string>) => state.dirty() || this.hasSubmitAttempted();
  // Only a new user gets a password here; an existing one changes their own.
  private readonly whenEditedAndNew = (context: ChildFieldContext<string>) => this.editingUserId() === null && this.whenEdited(context);

  protected readonly model = signal<UserFormModel>(emptyFormModel());
  protected readonly userForm = form(this.model, (schemaPath) => {
    required(schemaPath.username, { when: this.whenEdited });
    required(schemaPath.firstName, { when: this.whenEdited });
    required(schemaPath.lastName, { when: this.whenEdited });
    required(schemaPath.password, { when: this.whenEditedAndNew });
    minLength(schemaPath.password, 8, { when: this.whenEditedAndNew });
  });

  // Re-evaluates the options once the active translation file (re)loads.
  private readonly translation = toSignal(this.transloco.selectTranslation());
  /** The company's sites; the headquarters is marked so the dropdown reads unambiguously. */
  protected readonly branchOptions = computed<{ label: string; value: string }[]>(() => {
    this.translation();
    return this.branchService.branches.value().map((branch) => ({
      label: branch.headquarters ? `${branch.name} (${this.transloco.translate('users.headquarters')})` : branch.name,
      value: branch.id,
    }));
  });

  protected readonly roleOptions = computed<{ label: string; value: User['role'] }[]>(() => {
    this.translation();
    return [
      { label: this.transloco.translate('users.roleUser'), value: 'user' },
      { label: this.transloco.translate('users.roleAdmin'), value: 'admin' },
    ];
  });

  protected onAdd(): void {
    this.openDialog(null);
  }

  protected onEdit(user: User): void {
    this.openDialog(user);
  }

  private openDialog(user: User | null): void {
    this.editingUserId.set(user?.id ?? null);
    this.model.set(user === null ? emptyFormModel() : toFormModel(user));
    this.userForm().reset();
    this.hasSubmitAttempted.set(false);
    this.isPasswordVisible.set(false);
    this.isDialogVisible.set(true);
  }

  /** Fills the password field with a fresh random one and reveals it. */
  protected onGeneratePassword(): void {
    const draws = crypto.getRandomValues(new Uint32Array(GENERATED_PASSWORD_LENGTH));
    const password = Array.from(draws, (draw) => PASSWORD_ALPHABET[draw % PASSWORD_ALPHABET.length]).join('');
    this.model.update((model) => ({ ...model, password }));
    // Setting the value programmatically leaves the field pristine, so the
    // generated password would otherwise stay unjudged until the admin types.
    this.userForm.password().markAsDirty();
    this.isPasswordVisible.set(true);
  }

  protected async onSave(event: Event): Promise<void> {
    event.preventDefault();
    this.hasSubmitAttempted.set(true);
    await submit(this.userForm, async () => {
      this.isSaving.set(true);
      const editingUserId = this.editingUserId();
      try {
        const model = this.model();
        // Spelled out rather than spread, so the password never travels along an update.
        const update: UserUpdate = {
          username: model.username.trim(),
          firstName: model.firstName.trim(),
          lastName: model.lastName.trim(),
          branchId: model.branchId,
          role: model.role,
          active: model.active,
        };
        if (editingUserId === null) {
          await this.usersService.create({ ...update, password: model.password });
        } else {
          await this.usersService.update(editingUserId, update);
        }
        this.isDialogVisible.set(false);
        this.toast('success', editingUserId === null ? 'users.created' : 'users.saved');
      } catch (error) {
        this.toast(...this.saveFailure(error, editingUserId));
      } finally {
        this.isSaving.set(false);
      }
    });
  }

  /**
   * The backend answers 409 for a taken username, and 400 when an admin would take away their
   * own access — both are the admin's to fix, not a broken save.
   */
  private saveFailure(error: unknown, editingUserId: string | null): ['warn' | 'error', string] {
    const status = error instanceof HttpErrorResponse ? error.status : 0;
    if (status === 409) {
      return ['warn', 'users.duplicate'];
    }
    if (status === 400) {
      return ['warn', 'users.selfChange'];
    }
    return ['error', editingUserId === null ? 'users.createError' : 'users.saveError'];
  }

  protected async onToggleActive(user: User): Promise<void> {
    try {
      await this.usersService.setActive(user, !user.active);
      this.toast('success', user.active ? 'users.deactivated' : 'users.activated');
    } catch (error) {
      // The backend answers 400 when an admin tries to deactivate themselves.
      const isSelfDeactivation = error instanceof HttpErrorResponse && error.status === 400;
      this.toast(isSelfDeactivation ? 'warn' : 'error', isSelfDeactivation ? 'users.selfDeactivate' : 'users.updateError');
    }
  }

  private toast(severity: 'success' | 'warn' | 'error', translationKey: string): void {
    this.messageService.add({ severity, summary: this.transloco.translate(translationKey) });
  }
}
