import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, linkedSignal, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { email, form, FormField, required, submit, validate } from '@angular/forms/signals';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { FieldsetModule } from 'primeng/fieldset';
import { FloatLabelModule } from 'primeng/floatlabel';
import { FileUpload, FileUploadHandlerEvent, FileUploadModule } from 'primeng/fileupload';
import { InputGroupModule } from 'primeng/inputgroup';
import { InputGroupAddonModule } from 'primeng/inputgroupaddon';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { TooltipModule } from 'primeng/tooltip';

import { BranchService } from '../../../shared/data/branch-service';
import { CompanyService } from '../../../shared/data/company-service';
import { Branch } from '../../../shared/model/branch';
import { Company, LogoDisplay } from '../../../shared/model/company';

const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

type CompanyFormModel = {
  name: string;
  website: string;
  logoDisplay: LogoDisplay;
  /** Hex color (#RRGGBB); empty means no company color. */
  primaryColor: string;
};

type BranchFormModel = {
  name: string;
  /** Exactly one site is the headquarters; marking a new one demotes the previous. */
  headquarters: boolean;
  street: string;
  postalCode: string;
  city: string;
  /** Dropdown choice; null while no country is picked. */
  country: string | null;
  phone: string;
  fax: string;
  email: string;
};

function toBranchFormModel(branch: Branch | null): BranchFormModel {
  return {
    name: branch?.name ?? '',
    headquarters: branch?.headquarters ?? false,
    street: branch?.street ?? '',
    postalCode: branch?.postalCode ?? '',
    city: branch?.city ?? '',
    country: branch?.country ?? null,
    phone: branch?.phone ?? '',
    fax: branch?.fax ?? '',
    email: branch?.email ?? '',
  };
}

function toFormModel(company: Company | null): CompanyFormModel {
  return {
    name: company?.name ?? '',
    website: company?.website ?? '',
    logoDisplay: company?.logoDisplay ?? 'WITH_NAME',
    primaryColor: company?.primaryColor ?? '',
  };
}

/** The signed-in admin's own company: logo, name, branding, and the company's sites. */
@Component({
  selector: 'app-company-page',
  imports: [
    FormField,
    TranslocoDirective,
    ButtonModule,
    DialogModule,
    FieldsetModule,
    FileUploadModule,
    FloatLabelModule,
    InputGroupModule,
    InputGroupAddonModule,
    InputTextModule,
    MessageModule,
    SelectModule,
    SelectButtonModule,
    TableModule,
    TagModule,
    ToggleSwitchModule,
    TooltipModule,
  ],
  templateUrl: './company-page.html',
})
export class CompanyPage {
  protected readonly companyService = inject(CompanyService);
  protected readonly branchService = inject(BranchService);
  private readonly messageService = inject(MessageService);
  private readonly transloco = inject(TranslocoService);

  private readonly logoUpload = viewChild.required(FileUpload);

  // Re-anchors on the loaded (or freshly saved) company, while staying freely editable in between.
  protected readonly model = linkedSignal(() => toFormModel(this.companyService.company.value()));
  protected readonly companyForm = form(this.model, (schemaPath) => {
    required(schemaPath.name);
    validate(schemaPath.primaryColor, ({ value }) => (value() === '' || /^#[0-9a-fA-F]{6}$/.test(value()) ? null : { kind: 'pattern' }));
  });

  /** The app serves the DACH region for now; free-text countries return when needed. */
  protected readonly countryOptions = ['Deutschland', 'Österreich', 'Schweiz'];

  // Re-evaluates the options once the active translation file (re)loads.
  private readonly translation = toSignal(this.transloco.selectTranslation());
  /** Sidebar branding: small logo beside the name, or one large logo filling the brand area. */
  protected readonly logoDisplayOptions = computed<{ label: string; value: LogoDisplay }[]>(() => {
    this.translation();
    return [
      { label: this.transloco.translate('company.logoWithName'), value: 'WITH_NAME' },
      { label: this.transloco.translate('company.logoOnly'), value: 'LOGO_ONLY' },
    ];
  });

  protected readonly isSaving = signal(false);
  protected readonly isSavingLogo = signal(false);
  // Validation errors stay hidden until the field was visited or a save was
  // attempted — submit() alone does not flip the fields' touched state.
  protected readonly hasSubmitAttempted = signal(false);

  protected readonly branchModel = signal<BranchFormModel>(toBranchFormModel(null));
  protected readonly branchForm = form(this.branchModel, (schemaPath) => {
    required(schemaPath.name);
    email(schemaPath.email);
  });
  /** The branch being edited in the dialog, or null while it creates a new one. */
  protected readonly editingBranchId = signal<string | null>(null);
  /**
   * Name of the site that currently is the headquarters, unless the dialog edits that very site —
   * marking another one demotes it, and the dialog says so before it happens.
   */
  protected readonly otherHeadquartersName = computed(
    () => this.branchService.branches.value().find((branch) => branch.headquarters && branch.id !== this.editingBranchId())?.name ?? null,
  );
  protected readonly isBranchDialogVisible = signal(false);
  protected readonly isSavingBranch = signal(false);
  protected readonly hasBranchSubmitAttempted = signal(false);

  protected onAddBranch(): void {
    this.openBranchDialog(null);
  }

  protected onEditBranch(branch: Branch): void {
    this.openBranchDialog(branch);
  }

  private openBranchDialog(branch: Branch | null): void {
    this.editingBranchId.set(branch?.id ?? null);
    this.branchModel.set(toBranchFormModel(branch));
    this.branchForm().reset();
    this.hasBranchSubmitAttempted.set(false);
    this.isBranchDialogVisible.set(true);
  }

  protected async onSaveBranch(event: Event): Promise<void> {
    event.preventDefault();
    this.hasBranchSubmitAttempted.set(true);
    await submit(this.branchForm, async () => {
      this.isSavingBranch.set(true);
      try {
        const model = this.branchModel();
        // The backend stores blank optional fields as "not set".
        const update = { ...model, name: model.name.trim() };
        const editingBranchId = this.editingBranchId();
        if (editingBranchId === null) {
          await this.branchService.create(update);
        } else {
          await this.branchService.update(editingBranchId, update);
        }
        this.isBranchDialogVisible.set(false);
        this.toast('success', 'company.branchSaved');
      } catch (error) {
        // The backend answers 409 when the name is already taken in this company.
        const isDuplicate = error instanceof HttpErrorResponse && error.status === 409;
        this.toast(isDuplicate ? 'warn' : 'error', isDuplicate ? 'company.branchDuplicate' : 'company.error');
      } finally {
        this.isSavingBranch.set(false);
      }
    });
  }

  protected async onDeleteBranch(branch: Branch): Promise<void> {
    try {
      await this.branchService.remove(branch.id);
      this.toast('success', 'company.branchDeleted');
    } catch {
      this.toast('error', 'company.error');
    }
  }

  /** Called by the upload widget right after a file was chosen (auto mode). */
  protected async onUploadLogo(event: FileUploadHandlerEvent): Promise<void> {
    const file = event.files[0] as File | undefined;
    // The widget keeps the chosen file; clear it so the next pick fires again.
    this.logoUpload().clear();
    if (!file) {
      return;
    }
    if (!ALLOWED_IMAGE_TYPES.includes(file.type) || file.size > MAX_IMAGE_BYTES) {
      this.toast('warn', 'company.logoInvalid');
      return;
    }
    this.isSavingLogo.set(true);
    try {
      await this.companyService.uploadLogo(file);
      this.toast('success', 'company.logoSaved');
    } catch {
      this.toast('error', 'company.error');
    } finally {
      this.isSavingLogo.set(false);
    }
  }

  protected async onRemoveLogo(): Promise<void> {
    this.isSavingLogo.set(true);
    try {
      await this.companyService.removeLogo();
      this.toast('success', 'company.logoRemoved');
    } catch {
      this.toast('error', 'company.error');
    } finally {
      this.isSavingLogo.set(false);
    }
  }

  protected async onSave(event: Event): Promise<void> {
    event.preventDefault();
    this.hasSubmitAttempted.set(true);
    await submit(this.companyForm, async () => {
      this.isSaving.set(true);
      try {
        const model = this.model();
        await this.companyService.save({
          ...model,
          name: model.name.trim(),
          // The backend validates the hex pattern, which an empty string would fail.
          primaryColor: model.primaryColor === '' ? null : model.primaryColor,
        });
        this.hasSubmitAttempted.set(false);
        // Back to pristine: the save button stays disabled until the next edit.
        this.companyForm().reset();
        this.toast('success', 'company.saved');
      } catch {
        this.toast('error', 'company.error');
      } finally {
        this.isSaving.set(false);
      }
    });
  }

  private toast(severity: 'success' | 'warn' | 'error', translationKey: string): void {
    this.messageService.add({ severity, summary: this.transloco.translate(translationKey) });
  }
}
