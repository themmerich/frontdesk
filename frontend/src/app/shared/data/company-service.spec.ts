import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationRef, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { Company } from '../model/company';
import { CompanyService } from './company-service';

const company: Company = {
  name: 'Musterfirma GmbH',
  street: 'Hauptstr. 1',
  postalCode: '12345',
  city: 'Musterstadt',
  country: null,
  phone: null,
  fax: null,
  email: null,
  website: null,
  logoDisplay: 'WITH_NAME',
  hasLogo: false,
};

describe('CompanyService', () => {
  let service: CompanyService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(CompanyService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

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

  it('forgets the logo after removal', async () => {
    await flushInitialLoad({ ...company, hasLogo: true });

    const removing = service.removeLogo();
    httpTesting.expectOne({ method: 'DELETE', url: '/api/company/logo' }).flush(null);
    await removing;

    expect(service.logoUrl()).toBeNull();
    httpTesting.verify();
  });
});
