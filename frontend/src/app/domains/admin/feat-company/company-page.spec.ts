import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { MessageService, ToastMessageOptions } from 'primeng/api';

import { CompanyService } from '../../../shared/data/company-service';
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
    address: 'Address',
    street: 'Street',
    postalCode: 'Postal code',
    city: 'City',
    country: 'Country',
    contact: 'Contact',
    phone: 'Phone',
    fax: 'Fax',
    email: 'Email address',
    emailInvalid: 'Please enter a valid email address.',
    website: 'Website',
    save: 'Save',
    saved: 'Company data saved.',
    error: 'Saving failed.',
    loadError: 'Could not load the company data.',
  },
};

const storedCompany: Company = {
  name: 'Musterfirma GmbH',
  street: 'Hauptstr. 1',
  postalCode: '12345',
  city: 'Musterstadt',
  country: 'Deutschland',
  phone: '+49 30 123',
  fax: null,
  email: 'info@musterfirma.example',
  website: null,
  logoDisplay: 'WITH_NAME',
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
    savedUpdates = [];
    removedLogo = false;
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

  it('shows the stored company data in the form', () => {
    const element = createFixture().nativeElement as HTMLElement;

    expect((element.querySelector('#name') as HTMLInputElement).value).toBe('Musterfirma GmbH');
    expect((element.querySelector('#street') as HTMLInputElement).value).toBe('Hauptstr. 1');
    expect((element.querySelector('#city') as HTMLInputElement).value).toBe('Musterstadt');
    // Absent optional fields render as empty inputs.
    expect((element.querySelector('#fax') as HTMLInputElement).value).toBe('');
  });

  it('saves the edited company and raises a toast', async () => {
    const fixture = createFixture();
    const element = fixture.nativeElement as HTMLElement;

    setInput(element, 'name', ' Musterfirma AG ');
    setInput(element, 'phone', '+49 30 999');
    await fixture.whenStable();
    element.querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    expect(savedUpdates).toHaveLength(1);
    expect(savedUpdates[0].name).toBe('Musterfirma AG');
    expect(savedUpdates[0].phone).toBe('+49 30 999');
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

    setInput(element, 'phone', '+49 30 999');
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

  it('rejects a broken email address before calling the backend', async () => {
    const fixture = createFixture();
    const element = fixture.nativeElement as HTMLElement;

    setInput(element, 'email', 'not-an-email');
    await fixture.whenStable();
    element.querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(savedUpdates).toHaveLength(0);
    expect(element.textContent).toContain('Please enter a valid email address.');
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

  it('offers the DACH countries in the dropdown and saves the choice', async () => {
    const fixture = createFixture();
    const element = fixture.nativeElement as HTMLElement;

    (element.querySelector('p-select') as HTMLElement).click();
    await fixture.whenStable();

    const options = Array.from(document.querySelectorAll('li[role="option"]'));
    expect(options.map((option) => option.textContent?.trim())).toEqual(['Deutschland', 'Österreich', 'Schweiz']);

    (options[1] as HTMLElement).click();
    await fixture.whenStable();
    element.querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    expect(savedUpdates).toHaveLength(1);
    expect(savedUpdates[0].country).toBe('Österreich');
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

  it('shows the load error when the API is unreachable', () => {
    error.set(new Error('connection refused'));
    const fixture = createFixture();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Could not load the company data.');
  });
});
