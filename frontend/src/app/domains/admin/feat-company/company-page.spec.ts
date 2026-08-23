import { HttpErrorResponse } from '@angular/common/http';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { MessageService, ToastMessageOptions } from 'primeng/api';

import { BranchService } from '../../../shared/data/branch-service';
import { CompanyService } from '../../../shared/data/company-service';
import { Branch, BranchUpdate } from '../../../shared/model/branch';
import { Company, CompanyUpdate } from '../../../shared/model/company';
import { CompanyPage } from './company-page';

const translations = {
  company: {
    title: 'Company',
    logo: 'Logo',
    upload: 'Upload logo',
    remove: 'Remove logo',
    data: 'Company data',
    name: 'Company name',
    nameRequired: 'Please enter a company name.',
    logoWithName: 'Logo + name',
    logoOnly: 'Logo only',
    color: 'Company color',
    colorInvalid: 'Please enter a hex code like #RRGGBB.',
    street: 'Street',
    postalCode: 'Postal code',
    city: 'City',
    country: 'Country',
    phone: 'Phone',
    fax: 'Fax',
    email: 'Email address',
    emailInvalid: 'Please enter a valid email address.',
    website: 'Website',
    save: 'Save',
    saved: 'Company data saved.',
    branches: 'Branches',
    branchName: 'Name',
    branchNameRequired: 'Please enter a name.',
    headquarters: 'Headquarters',
    headquartersMoves: '“{{name}}” becomes a regular branch.',
    branchAdd: 'New branch',
    branchEdit: 'Edit branch',
    branchDelete: 'Delete branch',
    branchActions: 'Actions',
    branchSaved: 'Branch saved.',
    branchDeleted: 'Branch deleted.',
    branchDuplicate: 'A branch with this name already exists.',
    branchesEmpty: 'No branches yet.',
    cancel: 'Cancel',
    error: 'Saving failed.',
    loadError: 'Could not load the company data.',
  },
};

const headquarters: Branch = {
  id: 'b1',
  name: 'Musterfirma GmbH',
  headquarters: true,
  street: 'Hauptstr. 1',
  postalCode: '12345',
  city: 'Musterstadt',
  country: null,
  phone: null,
  fax: null,
  email: null,
};

const filiale: Branch = { ...headquarters, id: 'b2', name: 'Filiale Hamburg', headquarters: false, city: 'Hamburg' };

const storedCompany: Company = {
  name: 'Musterfirma GmbH',
  website: 'https://musterfirma.example',
  logoDisplay: 'WITH_NAME',
  primaryColor: null,
  hasLogo: false,
};

describe('CompanyPage', () => {
  const companyValue = signal<Company | null>(null);
  const error = signal<Error | undefined>(undefined);
  const logoUrl = signal<string | null>(null);
  let savedUpdates: CompanyUpdate[];
  let removedLogo: boolean;
  let toasts: ToastMessageOptions[];
  const companyServiceStub = {
    company: { value: companyValue, error },
    logoUrl,
    save: (update: CompanyUpdate) => {
      savedUpdates.push(update);
      return Promise.resolve();
    },
    removeLogo: () => {
      removedLogo = true;
      return Promise.resolve();
    },
  } as unknown as CompanyService;

  const branchesValue = signal<Branch[]>([]);
  let createdBranches: BranchUpdate[];
  let updatedBranches: { id: string; update: BranchUpdate }[];
  let removedBranchIds: string[];
  let branchError: unknown;
  const branchServiceStub = {
    branches: { value: branchesValue },
    create: (update: BranchUpdate) => {
      createdBranches.push(update);
      return branchError ? Promise.reject(branchError) : Promise.resolve();
    },
    update: (id: string, update: BranchUpdate) => {
      updatedBranches.push({ id, update });
      return branchError ? Promise.reject(branchError) : Promise.resolve();
    },
    remove: (id: string) => {
      removedBranchIds.push(id);
      return Promise.resolve();
    },
  } as unknown as BranchService;

  beforeEach(async () => {
    // PrimeNG's overlay queries matchMedia via the document's view; JSDOM does not implement it.
    const view = document.defaultView as unknown as { matchMedia?: (query: string) => Partial<MediaQueryList> };
    view.matchMedia ??= (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    });

    companyValue.set(storedCompany);
    error.set(undefined);
    logoUrl.set(null);
    branchesValue.set([headquarters, filiale]);
    savedUpdates = [];
    removedLogo = false;
    createdBranches = [];
    updatedBranches = [];
    removedBranchIds = [];
    branchError = undefined;
    toasts = [];
    await TestBed.configureTestingModule({
      imports: [
        CompanyPage,
        TranslocoTestingModule.forRoot({
          langs: { en: translations },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
      providers: [
        provideZonelessChangeDetection(),
        { provide: BranchService, useValue: branchServiceStub },
        { provide: CompanyService, useValue: companyServiceStub },
        { provide: MessageService, useValue: { add: (toast: ToastMessageOptions) => toasts.push(toast) } },
      ],
    }).compileComponents();
  });

  function createFixture() {
    const fixture = TestBed.createComponent(CompanyPage);
    fixture.detectChanges();
    return fixture;
  }

  function setInput(element: HTMLElement, id: string, value: string) {
    const input = element.querySelector('#' + id) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  /** Opens the branch dialog through its trigger: "New branch", or a row's edit button. */
  async function openBranchDialog(fixture: ReturnType<typeof createFixture>, trigger: string): Promise<void> {
    const element = fixture.nativeElement as HTMLElement;
    const button =
      element.querySelector<HTMLButtonElement>(`button[aria-label="${trigger}"]`) ??
      (Array.from(element.querySelectorAll('button')).find((candidate) => candidate.textContent?.includes(trigger)) as HTMLButtonElement);
    button.click();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('shows the stored company data in the form', () => {
    const element = createFixture().nativeElement as HTMLElement;

    expect((element.querySelector('#name') as HTMLInputElement).value).toBe('Musterfirma GmbH');
    // The website belongs to the company itself, not to any of its sites.
    expect((element.querySelector('#website') as HTMLInputElement).value).toBe('https://musterfirma.example');
    // Address and contact data moved to the branches entirely.
    expect(element.querySelector('#street')).toBeNull();
    expect(element.querySelector('#phone')).toBeNull();
  });

  it('saves the edited company and raises a toast', async () => {
    const fixture = createFixture();
    const element = fixture.nativeElement as HTMLElement;

    setInput(element, 'name', ' Musterfirma AG ');
    setInput(element, 'website', 'https://musterfirma.de');
    await fixture.whenStable();
    element.querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    expect(savedUpdates).toHaveLength(1);
    expect(savedUpdates[0].name).toBe('Musterfirma AG');
    expect(savedUpdates[0].website).toBe('https://musterfirma.de');
    // The empty color field goes out as null, matching the backend's hex validation.
    expect(savedUpdates[0].primaryColor).toBeNull();
    expect(toasts[0].summary).toBe('Company data saved.');
    // The saved state is the new pristine baseline — the button disarms again.
    fixture.detectChanges();
    expect((element.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(true);
  });

  it('enables saving only while the form is valid and dirty', async () => {
    const fixture = createFixture();
    const element = fixture.nativeElement as HTMLElement;
    const saveButton = () => element.querySelector('button[type="submit"]') as HTMLButtonElement;

    // Freshly loaded means pristine — there is nothing to save yet.
    expect(saveButton().disabled).toBe(true);

    setInput(element, 'website', 'https://musterfirma.de');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(saveButton().disabled).toBe(false);

    setInput(element, 'name', '');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(saveButton().disabled).toBe(true);
  });

  it('does not save without a company name', async () => {
    const fixture = createFixture();
    const element = fixture.nativeElement as HTMLElement;

    setInput(element, 'name', '');
    await fixture.whenStable();
    element.querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(savedUpdates).toHaveLength(0);
    expect(element.textContent).toContain('Please enter a company name.');
  });

  it('saves a valid company color and rejects a broken hex code', async () => {
    const fixture = createFixture();
    const element = fixture.nativeElement as HTMLElement;

    setInput(element, 'primaryColor', 'rot');
    await fixture.whenStable();
    element.querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(savedUpdates).toHaveLength(0);
    expect(element.textContent).toContain('Please enter a hex code like #RRGGBB.');

    setInput(element, 'primaryColor', '#10b981');
    await fixture.whenStable();
    element.querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    expect(savedUpdates).toHaveLength(1);
    expect(savedUpdates[0].primaryColor).toBe('#10b981');
  });

  it('saves the switch to the large logo-only branding', async () => {
    const fixture = createFixture();
    const element = fixture.nativeElement as HTMLElement;

    // PrimeNG's toggle buttons are host-based: the p-togglebutton element itself is the button.
    const logoOnlyButton = Array.from(element.querySelectorAll<HTMLElement>('p-selectbutton [role="button"]')).find((button) =>
      button.textContent?.includes('Logo only'),
    );
    expect(logoOnlyButton).toBeDefined();
    logoOnlyButton!.click();
    await fixture.whenStable();

    element.querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    expect(savedUpdates).toHaveLength(1);
    expect(savedUpdates[0].logoDisplay).toBe('LOGO_ONLY');
  });

  it('offers the DACH countries in the branch dialog and saves the choice', async () => {
    const fixture = createFixture();
    const element = fixture.nativeElement as HTMLElement;
    await openBranchDialog(fixture, 'New branch');

    (element.querySelector('p-select') as HTMLElement).click();
    await fixture.whenStable();

    const options = Array.from(document.querySelectorAll('li[role="option"]'));
    expect(options.map((option) => option.textContent?.trim())).toEqual(['Deutschland', 'Österreich', 'Schweiz']);

    (options[1] as HTMLElement).click();
    await fixture.whenStable();
    setInput(element, 'branchName', 'Filiale Wien');
    await fixture.whenStable();
    element.querySelectorAll('form')[1].dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    expect(createdBranches).toHaveLength(1);
    expect(createdBranches[0].country).toBe('Österreich');
  });

  it('offers the remove button only while a logo exists, and removes through it', async () => {
    const fixture = createFixture();
    const removeButton = () => (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('button[aria-label="Remove logo"]');

    expect(removeButton()).toBeNull();

    logoUrl.set('/api/company/logo?v=1');
    await fixture.whenStable();
    fixture.detectChanges();

    removeButton()!.click();
    await fixture.whenStable();

    expect(removedLogo).toBe(true);
  });

  it('lists every site, the headquarters first and marked as such', () => {
    const element = createFixture().nativeElement as HTMLElement;

    const rows = Array.from(element.querySelectorAll('tbody tr'));
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Musterfirma GmbH');
    expect(rows[0].querySelector('p-tag')?.textContent).toContain('Headquarters');
    expect(rows[1].textContent).toContain('Filiale Hamburg');
    expect(rows[1].querySelector('p-tag')).toBeNull();
  });

  it('creates a branch through the dialog', async () => {
    const fixture = createFixture();
    const element = fixture.nativeElement as HTMLElement;
    await openBranchDialog(fixture, 'New branch');

    setInput(element, 'branchName', ' Filiale Berlin ');
    setInput(element, 'branchCity', 'Berlin');
    await fixture.whenStable();
    element.querySelectorAll('form')[1].dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    expect(createdBranches).toHaveLength(1);
    expect(createdBranches[0].name).toBe('Filiale Berlin');
    expect(createdBranches[0].city).toBe('Berlin');
    expect(toasts[0].summary).toBe('Branch saved.');
  });

  it('does not create a branch without a name', async () => {
    const fixture = createFixture();
    const element = fixture.nativeElement as HTMLElement;
    await openBranchDialog(fixture, 'New branch');

    element.querySelectorAll('form')[1].dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(createdBranches).toHaveLength(0);
    expect(element.textContent).toContain('Please enter a name.');
  });

  it('creates a branch as a regular one unless the headquarters switch is on', async () => {
    const fixture = createFixture();
    const element = fixture.nativeElement as HTMLElement;
    await openBranchDialog(fixture, 'New branch');

    setInput(element, 'branchName', 'Filiale Berlin');
    await fixture.whenStable();
    element.querySelectorAll('form')[1].dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    expect(createdBranches[0].headquarters).toBe(false);
  });

  it('creates a branch as the headquarters and warns that the previous one steps back', async () => {
    const fixture = createFixture();
    const element = fixture.nativeElement as HTMLElement;
    await openBranchDialog(fixture, 'New branch');

    setInput(element, 'branchName', 'Hauptfiliale Berlin');
    (element.querySelector('#branchHeadquarters') as HTMLInputElement).click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(element.textContent).toContain('“Musterfirma GmbH” becomes a regular branch.');

    element.querySelectorAll('form')[1].dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    expect(createdBranches[0].headquarters).toBe(true);
  });

  it('edits a branch through the dialog, prefilled with the stored data', async () => {
    const fixture = createFixture();
    const element = fixture.nativeElement as HTMLElement;
    await openBranchDialog(fixture, 'Edit branch');

    expect((element.querySelector('#branchName') as HTMLInputElement).value).toBe('Musterfirma GmbH');
    // The headquarters edits itself without a warning about stepping on anyone.
    expect(element.textContent).not.toContain('becomes a regular branch');
    setInput(element, 'branchName', 'Hauptfiliale Musterstadt');
    await fixture.whenStable();
    element.querySelectorAll('form')[1].dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    expect(updatedBranches).toHaveLength(1);
    expect(updatedBranches[0].id).toBe('b1');
    expect(updatedBranches[0].update.name).toBe('Hauptfiliale Musterstadt');
    expect(updatedBranches[0].update.headquarters).toBe(true);
  });

  it('deletes a branch, the headquarters included', async () => {
    const fixture = createFixture();

    const deleteButtons = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button[aria-label="Delete branch"]');
    deleteButtons[0].click();
    await fixture.whenStable();

    expect(removedBranchIds).toEqual(['b1']);
    expect(toasts[0].summary).toBe('Branch deleted.');
  });

  it('reports a duplicate branch name distinctly', async () => {
    branchError = new HttpErrorResponse({ status: 409 });
    const fixture = createFixture();
    const element = fixture.nativeElement as HTMLElement;
    await openBranchDialog(fixture, 'New branch');

    setInput(element, 'branchName', 'Filiale Hamburg');
    await fixture.whenStable();
    element.querySelectorAll('form')[1].dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    expect(toasts[0].severity).toBe('warn');
    expect(toasts[0].summary).toBe('A branch with this name already exists.');
  });

  it('shows the load error when the API is unreachable', () => {
    error.set(new Error('connection refused'));
    const fixture = createFixture();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Could not load the company data.');
  });
});
