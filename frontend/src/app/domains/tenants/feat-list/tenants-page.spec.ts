import { HttpErrorResponse } from '@angular/common/http';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { MessageService, ToastMessageOptions } from 'primeng/api';

import { AuthStore, CurrentUser } from '../../../shared/data/auth-store';
import { CompanyService } from '../../../shared/data/company-service';
import { TenantsService } from '../data/tenants-service';
import { Tenant, TenantInput } from '../model/tenant';
import { TenantsPage } from './tenants-page';

const translations = {
  tenants: {
    title: 'Tenants',
    intro: 'Every tenant is a business.',
    create: 'New tenant',
    name: 'Name',
    slug: 'Kennung',
    slugHint: 'Lower-case letters.',
    nameRequired: 'Please enter a name.',
    slugInvalid: 'Only letters, digits and single dashes.',
    slugTaken: 'This Kennung is already taken.',
    users: 'Users',
    cases: 'Cases',
    createdAt: 'Created at',
    actions: 'Actions',
    open: 'Open',
    opened: 'Open now',
    edit: 'Edit',
    delete: 'Delete',
    createTitle: 'New tenant',
    editTitle: 'Edit tenant',
    save: 'Save',
    cancel: 'Cancel',
    deleteTitle: 'Delete tenant for good',
    deleteWarning: '{{name}} will be deleted.',
    deleteTypeName: 'Type the name',
    deleteConfirm: 'Delete for good',
    created: 'Tenant created.',
    saved: 'Tenant saved.',
    deleted: 'Tenant deleted.',
    createError: 'The tenant could not be created.',
    saveError: 'The tenant could not be saved.',
    deleteError: 'The tenant could not be deleted.',
    openError: 'The tenant could not be opened.',
    loadError: 'Could not load tenants.',
    empty: 'No tenant yet.',
  },
};

const musterfirma: Tenant = {
  id: 't1',
  slug: 'musterfirma',
  name: 'Musterfirma GmbH',
  createdAt: new Date('2026-08-01T10:00:00Z'),
  userCount: 2,
  caseCount: 3,
};

const beispiel: Tenant = { ...musterfirma, id: 't2', slug: 'beispiel-ag', name: 'Beispiel AG', userCount: 0, caseCount: 0 };

const superuser: CurrentUser = { username: 'super', displayName: 'Sina Super', role: 'superuser', tenant: null, hasAvatar: false };

describe('TenantsPage', () => {
  const tenants = signal<Tenant[]>([]);
  const error = signal<Error | undefined>(undefined);
  const isLoading = signal(false);
  const currentUser = signal<CurrentUser | null>(superuser);
  let toasts: ToastMessageOptions[];
  let created: TenantInput[];
  let updated: { id: string; input: TenantInput }[];
  let removed: string[];
  let opened: string[];
  let brandReloads: number;
  let refreshed: number;
  let saveError: unknown;

  const tenantsServiceStub = {
    tenants: { value: tenants, error, isLoading },
    create: (input: TenantInput) => {
      created.push(input);
      return saveError ? Promise.reject(saveError) : Promise.resolve();
    },
    update: (id: string, input: TenantInput) => {
      updated.push({ id, input });
      return saveError ? Promise.reject(saveError) : Promise.resolve();
    },
    remove: (id: string) => {
      removed.push(id);
      tenants.update((all) => all.filter((tenant) => tenant.id !== id));
      return Promise.resolve();
    },
  } as unknown as TenantsService;

  const authStoreStub = {
    currentUser,
    openTenant: (slug: string) => {
      opened.push(slug);
      currentUser.update((user) => (user ? { ...user, tenant: { slug, name: slug } } : user));
      return Promise.resolve();
    },
    refresh: () => {
      refreshed++;
      return Promise.resolve();
    },
  } as unknown as AuthStore;

  const companyServiceStub = { reload: () => brandReloads++ } as unknown as CompanyService;

  beforeEach(async () => {
    tenants.set([beispiel, musterfirma]);
    error.set(undefined);
    currentUser.set(superuser);
    toasts = [];
    created = [];
    updated = [];
    removed = [];
    opened = [];
    brandReloads = 0;
    refreshed = 0;
    saveError = undefined;
    await TestBed.configureTestingModule({
      imports: [
        TenantsPage,
        TranslocoTestingModule.forRoot({
          langs: { en: translations },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: TenantsService, useValue: tenantsServiceStub },
        { provide: AuthStore, useValue: authStoreStub },
        { provide: CompanyService, useValue: companyServiceStub },
        { provide: MessageService, useValue: { add: (toast: ToastMessageOptions) => toasts.push(toast) } },
      ],
    }).compileComponents();
  });

  function createFixture(): ComponentFixture<TenantsPage> {
    const fixture = TestBed.createComponent(TenantsPage);
    fixture.detectChanges();
    return fixture;
  }

  function button(element: HTMLElement, label: string): HTMLButtonElement {
    return Array.from(element.querySelectorAll('button')).find(
      (candidate) => candidate.textContent?.includes(label) || candidate.getAttribute('aria-label') === label,
    )!;
  }

  function rowOf(element: HTMLElement, name: string): HTMLElement {
    return Array.from(element.querySelectorAll('tbody tr')).find((row) => row.textContent?.includes(name)) as HTMLElement;
  }

  async function type(fixture: ComponentFixture<TenantsPage>, id: string, value: string): Promise<void> {
    const input = (fixture.nativeElement as HTMLElement).querySelector(`#${id}`) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function click(fixture: ComponentFixture<TenantsPage>, target: HTMLElement): Promise<void> {
    target.click();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('lists the tenants with what hangs on them, and marks the one open', () => {
    currentUser.set({ ...superuser, tenant: { slug: 'musterfirma', name: 'Musterfirma GmbH' } });
    const element = createFixture().nativeElement as HTMLElement;

    const row = rowOf(element, 'Musterfirma GmbH');
    expect(row.textContent).toContain('musterfirma');
    expect(row.textContent).toContain('2');
    expect(row.textContent).toContain('3');
    expect(row.textContent).toContain('Open now');
    expect(row.getAttribute('aria-current')).toBe('true');
    expect(rowOf(element, 'Beispiel AG').getAttribute('aria-current')).toBeNull();
  });

  it('shows the load error when the API is unreachable', () => {
    error.set(new Error('down'));

    expect((createFixture().nativeElement as HTMLElement).textContent).toContain('Could not load tenants.');
  });

  it('creates a tenant, proposing the Kennung from the name until it is touched', async () => {
    const fixture = createFixture();
    const element = fixture.nativeElement as HTMLElement;
    await click(fixture, button(element, 'New tenant'));

    await type(fixture, 'tenant-name', 'Müller & Söhne GmbH');
    expect((element.querySelector('#tenant-slug') as HTMLInputElement).value).toBe('mueller-soehne-gmbh');

    await type(fixture, 'tenant-slug', 'mueller');
    await type(fixture, 'tenant-name', 'Müller & Söhne KG');
    expect((element.querySelector('#tenant-slug') as HTMLInputElement).value).toBe('mueller');

    element.querySelector('form')?.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(created).toEqual([{ name: 'Müller & Söhne KG', slug: 'mueller' }]);
    expect(toasts.map((toast) => toast.summary)).toEqual(['Tenant created.']);
  });

  it('keeps a malformed Kennung unsaved and names the rule', async () => {
    const fixture = createFixture();
    const element = fixture.nativeElement as HTMLElement;
    await click(fixture, button(element, 'New tenant'));
    await type(fixture, 'tenant-name', 'Beispiel');
    await type(fixture, 'tenant-slug', 'beispiel--ag');

    element.querySelector('form')?.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(created).toEqual([]);
    expect(element.textContent).toContain('Only letters, digits and single dashes.');
  });

  it('names a taken Kennung under the field and keeps the dialog open', async () => {
    saveError = new HttpErrorResponse({ status: 409, error: { reason: 'slug' } });
    const fixture = createFixture();
    const element = fixture.nativeElement as HTMLElement;
    await click(fixture, button(element, 'New tenant'));
    await type(fixture, 'tenant-name', 'Musterfirma');

    element.querySelector('form')?.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(element.textContent).toContain('This Kennung is already taken.');
    expect(element.querySelector('p-dialog form')).not.toBeNull();
    expect(toasts).toEqual([]);

    // The next edit clears the verdict.
    await type(fixture, 'tenant-slug', 'musterfirma-2');
    expect(element.textContent).not.toContain('This Kennung is already taken.');
  });

  it('edits a tenant through its row action, prefilled, without proposing a Kennung', async () => {
    const fixture = createFixture();
    const element = fixture.nativeElement as HTMLElement;
    await click(fixture, button(rowOf(element, 'Beispiel AG'), 'Edit'));

    expect((element.querySelector('#tenant-name') as HTMLInputElement).value).toBe('Beispiel AG');
    expect((element.querySelector('#tenant-slug') as HTMLInputElement).value).toBe('beispiel-ag');

    await type(fixture, 'tenant-name', 'Beispiel SE');
    // The stored Kennung is the person's already; a renamed tenant keeps it.
    expect((element.querySelector('#tenant-slug') as HTMLInputElement).value).toBe('beispiel-ag');

    element.querySelector('form')?.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(updated).toEqual([{ id: 't2', input: { name: 'Beispiel SE', slug: 'beispiel-ag' } }]);
    expect(toasts.map((toast) => toast.summary)).toEqual(['Tenant saved.']);
  });

  it('deletes a tenant only once its name was typed', async () => {
    const fixture = createFixture();
    const element = fixture.nativeElement as HTMLElement;
    await click(fixture, button(rowOf(element, 'Beispiel AG'), 'Delete'));

    expect(element.textContent).toContain('Beispiel AG will be deleted.');
    const confirm = button(element, 'Delete for good');
    expect(confirm.disabled).toBe(true);

    await type(fixture, 'tenant-delete-confirmation', 'Beispiel');
    expect(button(element, 'Delete for good').disabled).toBe(true);

    await type(fixture, 'tenant-delete-confirmation', 'Beispiel AG');
    expect(button(element, 'Delete for good').disabled).toBe(false);
    await click(fixture, button(element, 'Delete for good'));

    expect(removed).toEqual(['t2']);
    expect(toasts.map((toast) => toast.summary)).toEqual(['Tenant deleted.']);
    // Not the open one: the session and the brand stay.
    expect(refreshed).toBe(0);
    expect(brandReloads).toBe(0);
  });

  it('forgets the session tenant and the brand when the open tenant is deleted', async () => {
    currentUser.set({ ...superuser, tenant: { slug: 'beispiel-ag', name: 'Beispiel AG' } });
    const fixture = createFixture();
    const element = fixture.nativeElement as HTMLElement;
    await click(fixture, button(rowOf(element, 'Beispiel AG'), 'Delete'));
    await type(fixture, 'tenant-delete-confirmation', 'Beispiel AG');
    await click(fixture, button(element, 'Delete for good'));

    expect(removed).toEqual(['t2']);
    expect(refreshed).toBe(1);
    expect(brandReloads).toBe(1);
  });

  it('opens a tenant and leads into its dashboard', async () => {
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    const fixture = createFixture();
    const element = fixture.nativeElement as HTMLElement;

    await click(fixture, button(rowOf(element, 'Musterfirma GmbH'), 'Open'));

    expect(opened).toEqual(['musterfirma']);
    // The brand follows the session inside the store, not here.
    expect(brandReloads).toBe(0);
    expect(navigateSpy).toHaveBeenCalledWith('/dashboard');
  });
});
