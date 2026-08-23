import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationRef, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { Branch } from '../model/branch';
import { BranchService } from './branch-service';

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

const filiale: Branch = { ...headquarters, id: 'b2', name: 'Filiale Hamburg', headquarters: false };

describe('BranchService', () => {
  let service: BranchService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(BranchService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  async function flushInitialLoad(loaded: Branch[]): Promise<void> {
    TestBed.tick();
    httpTesting.expectOne('/api/branches').flush(loaded);
    await TestBed.inject(ApplicationRef).whenStable();
  }

  it('starts with an empty list before the API answered', () => {
    expect(service.branches.value()).toEqual([]);
  });

  it('loads the branches', async () => {
    await flushInitialLoad([headquarters, filiale]);

    expect(service.branches.value()).toEqual([headquarters, filiale]);
    httpTesting.verify();
  });

  it('creates a branch and reloads the list', async () => {
    await flushInitialLoad([headquarters]);

    const creating = service.create({ ...filiale });
    httpTesting.expectOne({ method: 'POST', url: '/api/branches' }).flush(filiale);
    await creating;
    TestBed.tick();
    httpTesting.expectOne('/api/branches').flush([headquarters, filiale]);
    await TestBed.inject(ApplicationRef).whenStable();

    expect(service.branches.value()).toEqual([headquarters, filiale]);
    httpTesting.verify();
  });

  it('updates a branch and reloads the list', async () => {
    await flushInitialLoad([headquarters, filiale]);

    const renamed = { ...filiale, name: 'Filiale Altona' };
    const updating = service.update(filiale.id, renamed);
    httpTesting.expectOne({ method: 'PUT', url: '/api/branches/b2' }).flush(renamed);
    await updating;
    TestBed.tick();
    httpTesting.expectOne('/api/branches').flush([headquarters, renamed]);
    await TestBed.inject(ApplicationRef).whenStable();

    expect(service.branches.value()[1].name).toBe('Filiale Altona');
    httpTesting.verify();
  });

  it('removes a branch and reloads the list', async () => {
    await flushInitialLoad([headquarters, filiale]);

    const removing = service.remove(filiale.id);
    httpTesting.expectOne({ method: 'DELETE', url: '/api/branches/b2' }).flush(null);
    await removing;
    TestBed.tick();
    httpTesting.expectOne('/api/branches').flush([headquarters]);
    await TestBed.inject(ApplicationRef).whenStable();

    expect(service.branches.value()).toEqual([headquarters]);
    httpTesting.verify();
  });
});
