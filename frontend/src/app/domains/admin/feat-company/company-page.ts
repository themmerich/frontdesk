import { Component, computed, inject, linkedSignal, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { email, form, FormField, required, submit, validate } from '@angular/forms/signals';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { FieldsetModule } from 'primeng/fieldset';
import { FloatLabelModule } from 'primeng/floatlabel';
import { FileUpload, FileUploadHandlerEvent, FileUploadModule } from 'primeng/fileupload';
import { InputGroupModule } from 'primeng/inputgroup';
import { InputGroupAddonModule } from 'primeng/inputgroupaddon';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TooltipModule } from 'primeng/tooltip';

import { CompanyService } from '../../../shared/data/company-service';
import { Company, LogoDisplay } from '../../../shared/model/company';

const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

type CompanyFormModel = {
  name: string;
  street: string;
  postalCode: string;
  city: string;
  /** Dropdown choice; null while no country is picked. */
  country: string | null;
  phone: string;
  fax: string;
  email: string;
  website: string;
  logoDisplay: LogoDisplay;
  /** Hex color (#RRGGBB); empty means no company color. */
  primaryColor: string;
};

function toFormModel(company: Company | null): CompanyFormModel {
  if (company === null) {
    return {
      name: '',
      street: '',
      postalCode: '',
      city: '',
      country: null,
      phone: '',
      fax: '',
      email: '',
      website: '',
      logoDisplay: 'WITH_NAME',
      primaryColor: '',
    };
  }
  return {
    name: company.name,
    street: company.street ?? '',
    postalCode: company.postalCode ?? '',
    city: company.city ?? '',
    country: company.country,
    phone: company.phone ?? '',
    fax: company.fax ?? '',
    email: company.email ?? '',
    website: company.website ?? '',
    logoDisplay: company.logoDisplay,
    primaryColor: company.primaryColor ?? '',
  };
}

/** The signed-in admin's own company: logo, name, address, and contact data. */
@Component({
  selector: 'app-company-page',
  imports: [
    FormField,
    TranslocoDirective,
    ButtonModule,
    FieldsetModule,
    FileUploadModule,
    FloatLabelModule,
    InputGroupModule,
    InputGroupAddonModule,
    InputTextModule,
    MessageModule,
    SelectModule,
    SelectButtonModule,
    TooltipModule,
  ],
  templateUrl: './company-page.html',
})
export class CompanyPage {
  protected readonly companyService = inject(CompanyService);
  private readonly messageService = inject(MessageService);
  private readonly transloco = inject(TranslocoService);

  private readonly logoUpload = viewChild.required(FileUpload);

  // Re-anchors on the loaded (or freshly saved) company, while staying freely editable in between.
  protected readonly model = linkedSignal(() => toFormModel(this.companyService.company.value()));
  protected readonly companyForm = form(this.model, (schemaPath) => {
    required(schemaPath.name);
    email(schemaPath.email);
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
