import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationRef, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { Company } from '../model/company';
import { COMPANY_STORAGE, CompanyService } from './company-service';

const company: Company = {
  name: 'Musterfirma GmbH',
  website: null,
  logoDisplay: 'WITH_NAME',
  primaryColor: null,
  hasLogo: false,
};

/** An in-memory stand-in for localStorage; see COMPANY_STORAGE for why it is injected. */
function fakeStorage(entries: Record<string, string> = {}): Storage {
  const stored = new Map(Object.entries(entries));
  return {
    getItem: (key: string) => stored.get(key) ?? null,
    setItem: (key: string, value: string) => void stored.set(key, value),
    removeItem: (key: string) => void stored.delete(key),
    clear: () => stored.clear(),
    key: (index: number) => [...stored.keys()][index] ?? null,
    get length() {
      return stored.size;
    },
  };
}

describe('CompanyService', () => {
  let service: CompanyService;
  let httpTesting: HttpTestingController;
  let storage: Storage;

  beforeEach(() => {
    storage = fakeStorage();
    configure(storage);
  });

  function configure(withStorage: Storage | null): void {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: COMPANY_STORAGE, useValue: withStorage },
      ],
    });
    service = TestBed.inject(CompanyService);
    httpTesting = TestBed.inject(HttpTestingController);
  }

  async function flushInitialLoad(loaded: Company): Promise<void> {
    TestBed.tick();
    httpTesting.expectOne('/api/company').flush(loaded);
    await TestBed.inject(ApplicationRef).whenStable();
  }

  it('starts without a company before the API answered', () => {
    expect(service.company.value()).toBeNull();
    expect(service.name()).toBeUndefined();
    expect(service.logoUrl()).toBeNull();
  });

  it('loads the company and exposes name and logo URL', async () => {
    await flushInitialLoad({ ...company, hasLogo: true });

    expect(service.name()).toBe('Musterfirma GmbH');
    expect(service.logoUrl()).toBe('/api/company/logo?v=0');
    // The small-logo-beside-the-name mode never yields a large brand logo.
    expect(service.largeLogoUrl()).toBeNull();
    httpTesting.verify();
  });

  it('exposes the tenant brand color once loaded', async () => {
    await flushInitialLoad({ ...company, primaryColor: '#10b981' });

    expect(service.primaryColor()).toBe('#10b981');
    httpTesting.verify();
  });

  it('exposes the large brand logo only in logo-only mode', async () => {
    await flushInitialLoad({ ...company, hasLogo: true, logoDisplay: 'LOGO_ONLY' });

    expect(service.largeLogoUrl()).toBe('/api/company/logo?v=0');
    httpTesting.verify();
  });

  it('saves and reflects the server answer, so consumers show the stored state', async () => {
    await flushInitialLoad(company);

    const saving = service.save({ ...company, name: 'Musterfirma AG' });
    httpTesting.expectOne({ method: 'PUT', url: '/api/company' }).flush({ ...company, name: 'Musterfirma AG' });
    await saving;

    expect(service.name()).toBe('Musterfirma AG');
    httpTesting.verify();
  });

  it('marks the logo present after an upload and busts the image cache', async () => {
    await flushInitialLoad(company);

    const uploading = service.uploadLogo(new File(['x'], 'logo.png', { type: 'image/png' }));
    httpTesting.expectOne({ method: 'PUT', url: '/api/company/logo' }).flush(null);
    await uploading;

    expect(service.logoUrl()).toBe('/api/company/logo?v=1');
    httpTesting.verify();
  });

  it('starts from the company this browser saw last, before the API answers at all', () => {
    const brand: Company = { ...company, name: 'Musterfirma AG', primaryColor: '#1d4ed8', hasLogo: true };
    configure(fakeStorage({ 'frontdesk-company': JSON.stringify(brand) }));

    // Nothing has been asked yet: the sidebar can paint the tenant's brand rather than the app's.
    expect(service.name()).toBe('Musterfirma AG');
    expect(service.primaryColor()).toBe('#1d4ed8');
    expect(service.logoUrl()).toBe('/api/company/logo?v=0');
  });

  it('remembers what the API answered, and what was saved through it', async () => {
    await flushInitialLoad({ ...company, primaryColor: '#1d4ed8' });

    expect(JSON.parse(storage.getItem('frontdesk-company')!)).toEqual({ ...company, primaryColor: '#1d4ed8' });

    const saving = service.save({ ...company, name: 'Musterfirma AG' });
    httpTesting.expectOne({ method: 'PUT', url: '/api/company' }).flush({ ...company, name: 'Musterfirma AG' });
    await saving;
    await TestBed.inject(ApplicationRef).whenStable();

    // A company that renames itself is remembered as it now is, not as it was first seen.
    expect(JSON.parse(storage.getItem('frontdesk-company')!).name).toBe('Musterfirma AG');
  });

  it('ignores an entry that is not a company any more', () => {
    configure(fakeStorage({ 'frontdesk-company': '{"name":42}' }));
    expect(service.company.value()).toBeNull();

    configure(fakeStorage({ 'frontdesk-company': 'not json at all' }));
    expect(service.company.value()).toBeNull();
  });

  it('forgets the brand when asked, for whoever sits down at this browser next', async () => {
    await flushInitialLoad(company);
    expect(storage.getItem('frontdesk-company')).not.toBeNull();

    service.forget();

    expect(storage.getItem('frontdesk-company')).toBeNull();
  });

  it('works where the browser keeps nothing at all', () => {
    configure(null);

    expect(service.company.value()).toBeNull();
    expect(() => service.forget()).not.toThrow();
  });

  it('forgets the logo after removal', async () => {
    await flushInitialLoad({ ...company, hasLogo: true });

    const removing = service.removeLogo();
    httpTesting.expectOne({ method: 'DELETE', url: '/api/company/logo' }).flush(null);
    await removing;

    expect(service.logoUrl()).toBeNull();
    httpTesting.verify();
  });
});
