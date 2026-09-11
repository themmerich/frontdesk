import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { MessageService, ToastMessageOptions } from 'primeng/api';

import { BranchService } from '../../../shared/data/branch-service';
import { CompanyService } from '../../../shared/data/company-service';
import { Branch } from '../../../shared/model/branch';
import { Company, CompanyUpdate } from '../../../shared/model/company';
import { SignaturePerson } from '../../../shared/model/signature';
import { OwnProfileService } from '../data/own-profile-service';
import { UsersService } from '../data/users-service';
import { User } from '../model/user';
import { CompanyPage } from './company-page';

/** Only what the signature section reads; everything else renders as its key. */
const translations = {
  company: {
    signature: 'Email signature',
    signatureTemplate: 'Signature',
    signaturePreview: 'Preview',
    save: 'Save',
    saved: 'Company data saved.',
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
  phone: '030 555',
  fax: null,
  email: null,
};
const filiale: Branch = { ...headquarters, id: 'b2', name: 'Filiale Hamburg', headquarters: false, city: 'Hamburg', phone: '040 777' };

const storedCompany: Company = {
  name: 'Musterfirma GmbH',
  website: 'https://musterfirma.example',
  logoDisplay: 'WITH_NAME',
  primaryColor: null,
  hasLogo: false,
  replySignature: '',
  signatureUserId: null,
};

/** The admin at the desk, as the preview signs with them. */
const anna: SignaturePerson = {
  firstName: 'Anna',
  lastName: 'Admin',
  position: 'Geschäftsführerin',
  phone: '030 123',
  fax: null,
  email: 'anna@musterfirma.example',
  branchId: 'b2',
};

const aUser = (overrides: Partial<User>): User => ({
  id: 'u1',
  username: 'anna',
  firstName: 'Anna',
  lastName: 'Admin',
  role: 'admin',
  active: true,
  branchId: 'b2',
  createdAt: new Date('2026-08-01T10:00:00Z'),
  position: null,
  ...overrides,
});

describe('CompanyPage signature', () => {
  const person = signal<SignaturePerson | null>(anna);
  let savedUpdates: CompanyUpdate[];
  let toasts: ToastMessageOptions[];

  beforeEach(async () => {
    person.set(anna);
    savedUpdates = [];
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
        {
          provide: CompanyService,
          useValue: {
            company: { value: signal(storedCompany), error: signal(undefined) },
            logoUrl: signal(null),
            save: (update: CompanyUpdate) => {
              savedUpdates.push(update);
              return Promise.resolve();
            },
          } as unknown as CompanyService,
        },
        { provide: BranchService, useValue: { branches: { value: signal([headquarters, filiale]) } } as unknown as BranchService },
        {
          provide: UsersService,
          useValue: {
            users: {
              value: signal([
                aUser({}),
                aUser({ id: 'u2', username: 'ben', firstName: 'Ben', lastName: 'Benutzer', role: 'user', branchId: null }),
              ]),
              error: signal(undefined),
            },
          } as unknown as UsersService,
        },
        { provide: OwnProfileService, useValue: { person } as unknown as OwnProfileService },
        { provide: MessageService, useValue: { add: (toast: ToastMessageOptions) => toasts.push(toast) } },
      ],
    }).compileComponents();
  });

  function createFixture() {
    const fixture = TestBed.createComponent(CompanyPage);
    fixture.detectChanges();
    return fixture;
  }

  function typeTemplate(element: HTMLElement, template: string): void {
    const textarea = element.querySelector('#replySignature') as HTMLTextAreaElement;
    textarea.value = template;
    textarea.dispatchEvent(new Event('input'));
  }

  const preview = (element: HTMLElement) => element.querySelector('pre')!.textContent;

  it('lists every placeholder beside the template', () => {
    const element = createFixture().nativeElement as HTMLElement;

    const names = Array.from(element.querySelectorAll('code')).map((code) => code.textContent);
    expect(names).toHaveLength(15);
    expect(names).toContain('{{vorname}}');
    expect(names).toContain('{{filialtelefon}}');
  });

  it('shows the template filled in for the admin, with their branch and the company as it stands in the form', async () => {
    const fixture = createFixture();
    const element = fixture.nativeElement as HTMLElement;
    // The stored template is empty; so is the preview.
    expect(preview(element)).toBe('');

    typeTemplate(
      element,
      'Mit freundlichen Grüßen\n{{vorname}} {{nachname}}, {{position}}\nTel. {{telefon}} · Fax {{fax}}\n{{firma}} · {{filiale}}, {{ort}}',
    );
    await fixture.whenStable();

    // Anna's own data and her branch; the fax line lost its fax but kept its phone.
    expect(preview(element)).toBe(
      'Mit freundlichen Grüßen\nAnna Admin, Geschäftsführerin\nTel. 030 123 · Fax\nMusterfirma GmbH · Filiale Hamburg, Hamburg',
    );
  });

  it('falls back to the headquarters for an admin without a branch, and to the company alone without a profile', async () => {
    person.set({ ...anna, branchId: null });
    const fixture = createFixture();
    const element = fixture.nativeElement as HTMLElement;

    typeTemplate(element, '{{nachname}} · {{filiale}}, {{filialtelefon}}');
    await fixture.whenStable();
    expect(preview(element)).toBe('Admin · Musterfirma GmbH, 030 555');

    // No profile to hand: the person lines go, the branch stays the headquarters.
    person.set(null);
    await fixture.whenStable();
    expect(preview(element)).toBe('· Musterfirma GmbH, 030 555');
  });

  it('saves the template together with who signs for the scheduler', async () => {
    const fixture = createFixture();
    const element = fixture.nativeElement as HTMLElement;

    typeTemplate(element, '{{vorname}} {{nachname}}\n{{firma}}');
    fixture.componentInstance['model'].update((model) => ({ ...model, signatureUserId: 'u2' }));
    await fixture.whenStable();
    element.querySelector('form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    expect(savedUpdates).toHaveLength(1);
    expect(savedUpdates[0].replySignature).toBe('{{vorname}} {{nachname}}\n{{firma}}');
    expect(savedUpdates[0].signatureUserId).toBe('u2');
    expect(toasts[0].summary).toBe('Company data saved.');
  });
});
