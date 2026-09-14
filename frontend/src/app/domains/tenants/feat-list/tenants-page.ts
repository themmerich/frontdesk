import { DatePipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { ChildFieldContext, form, FormField, pattern, required, submit } from '@angular/forms/signals';
import { Router } from '@angular/router';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { FloatLabelModule } from 'primeng/floatlabel';
import { InputGroupModule } from 'primeng/inputgroup';
import { InputGroupAddonModule } from 'primeng/inputgroupaddon';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';

import { AuthStore } from '../../../shared/data/auth-store';
import { CompanyService } from '../../../shared/data/company-service';
import { TenantsService } from '../data/tenants-service';
import { proposeSlug, SLUG_PATTERN } from '../model/slug';
import { Tenant, TenantInput } from '../model/tenant';

/**
 * The tenants, for the super-user: listed with what hangs on them, created and renamed in a
 * dialog after the users page's pattern, deleted for good behind a typed name, and opened —
 * which makes the session about that tenant and leads into its dashboard.
 */
@Component({
  selector: 'app-tenants-page',
  imports: [
    DatePipe,
    FormField,
    TranslocoDirective,
    ButtonModule,
    DialogModule,
    FloatLabelModule,
    InputGroupModule,
    InputGroupAddonModule,
    InputTextModule,
    MessageModule,
    TableModule,
    TagModule,
    TooltipModule,
  ],
  templateUrl: './tenants-page.html',
})
export class TenantsPage {
  protected readonly tenantsService = inject(TenantsService);
  private readonly authStore = inject(AuthStore);
  private readonly companyService = inject(CompanyService);
  private readonly messageService = inject(MessageService);
  private readonly transloco = inject(TranslocoService);
  private readonly router = inject(Router);

  /** The Kennung of the tenant the session is about, so its row can say so. */
  protected readonly openSlug = computed(() => this.authStore.currentUser()?.tenant?.slug ?? null);

  /** The tenant being edited in the dialog, or null while it creates a new one. */
  protected readonly editingTenantId = signal<string | null>(null);
  protected readonly isDialogVisible = signal(false);
  protected readonly isSaving = signal(false);
  // A save attempt judges every field at once — submit() alone does not flip
  // the fields' touched state.
  protected readonly hasSubmitAttempted = signal(false);
  /** Set once the person edited the Kennung: from then on it no longer follows the name. */
  protected readonly isSlugTouched = signal(false);
  /** The backend refused the Kennung as taken; cleared with the next edit. */
  protected readonly isSlugTaken = signal(false);

  // A field is only judged once it was edited, or once a save was tried. PrimeNG marks an
  // invalid field red the moment it is bound, so without this a freshly opened dialog would
  // greet the person in red.
  private readonly whenEdited = ({ state }: ChildFieldContext<string>) => state.dirty() || this.hasSubmitAttempted();

  protected readonly model = signal<TenantInput>({ name: '', slug: '' });
  protected readonly tenantForm = form(this.model, (schemaPath) => {
    required(schemaPath.name, { when: this.whenEdited });
    required(schemaPath.slug, { when: this.whenEdited });
    pattern(schemaPath.slug, SLUG_PATTERN, { when: this.whenEdited });
  });

  /** The tenant about to be deleted, and what the person has typed to confirm it. */
  protected readonly deletingTenant = signal<Tenant | null>(null);
  protected readonly deleteConfirmation = signal('');
  protected readonly isDeleting = signal(false);
  protected readonly isDeleteConfirmed = computed(() => this.deleteConfirmation() === this.deletingTenant()?.name);

  protected readonly openingSlug = signal<string | null>(null);

  constructor() {
    // While creating, the Kennung follows the name until the person takes it over. Guarded so
    // the update does not wake the effect up again for the same proposal.
    effect(() => {
      const { name, slug } = this.model();
      if (this.editingTenantId() !== null || this.isSlugTouched()) {
        return;
      }
      const proposed = proposeSlug(name);
      if (proposed !== slug) {
        untracked(() => this.model.update((current) => ({ ...current, slug: proposed })));
      }
    });
  }

  protected onCreate(): void {
    this.openDialog(null);
  }

  protected onEdit(tenant: Tenant): void {
    this.openDialog(tenant);
  }

  private openDialog(tenant: Tenant | null): void {
    this.editingTenantId.set(tenant?.id ?? null);
    this.model.set(tenant === null ? { name: '', slug: '' } : { name: tenant.name, slug: tenant.slug });
    this.tenantForm().reset();
    this.hasSubmitAttempted.set(false);
    // An existing Kennung is the person's already; a new one is proposed until touched.
    this.isSlugTouched.set(tenant !== null);
    this.isSlugTaken.set(false);
    this.isDialogVisible.set(true);
  }

  protected onSlugInput(): void {
    this.isSlugTouched.set(true);
    this.isSlugTaken.set(false);
  }

  protected async onSave(event: Event): Promise<void> {
    event.preventDefault();
    this.hasSubmitAttempted.set(true);
    await submit(this.tenantForm, async () => {
      this.isSaving.set(true);
      const editingTenantId = this.editingTenantId();
      try {
        const input: TenantInput = { name: this.model().name.trim(), slug: this.model().slug.trim().toLowerCase() };
        if (editingTenantId === null) {
          await this.tenantsService.create(input);
        } else {
          await this.tenantsService.update(editingTenantId, input);
        }
        this.isDialogVisible.set(false);
        this.toast('success', editingTenantId === null ? 'tenants.created' : 'tenants.saved');
      } catch (error) {
        if (isSlugConflict(error)) {
          // The person's to fix, under the field rather than in a toast; the dialog stays open.
          this.isSlugTaken.set(true);
        } else {
          this.toast('error', editingTenantId === null ? 'tenants.createError' : 'tenants.saveError');
        }
      } finally {
        this.isSaving.set(false);
      }
    });
  }

  protected onDelete(tenant: Tenant): void {
    this.deleteConfirmation.set('');
    this.deletingTenant.set(tenant);
  }

  protected onDeleteConfirmationInput(event: Event): void {
    this.deleteConfirmation.set((event.target as HTMLInputElement).value);
  }

  protected async onConfirmDelete(): Promise<void> {
    const tenant = this.deletingTenant();
    if (tenant === null || !this.isDeleteConfirmed()) {
      return;
    }
    this.isDeleting.set(true);
    try {
      await this.tenantsService.remove(tenant.id);
      this.deletingTenant.set(null);
      this.toast('success', 'tenants.deleted');
      // The session forgot the tenant on the server if it was the open one; mirror that here,
      // brand included.
      if (this.openSlug() === tenant.slug) {
        await this.authStore.refresh();
        this.companyService.reload();
      }
    } catch {
      this.toast('error', 'tenants.deleteError');
    } finally {
      this.isDeleting.set(false);
    }
  }

  /** From here on the session is about this tenant; its dashboard is the natural first page. */
  protected async onOpen(tenant: Tenant): Promise<void> {
    this.openingSlug.set(tenant.slug);
    try {
      await this.authStore.openTenant(tenant.slug);
      await this.router.navigateByUrl('/dashboard');
    } catch {
      this.toast('error', 'tenants.openError');
    } finally {
      this.openingSlug.set(null);
    }
  }

  private toast(severity: 'success' | 'error', translationKey: string): void {
    this.messageService.add({ severity, summary: this.transloco.translate(translationKey) });
  }
}

/** The backend's 409 for a Kennung another tenant has. */
function isSlugConflict(error: unknown): boolean {
  return error instanceof HttpErrorResponse && error.status === 409 && (error.error as { reason?: string })?.reason === 'slug';
}
