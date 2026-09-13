import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationRef, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { TenantsService } from './tenants-service';

const musterfirma = {
  id: 't1',
  slug: 'musterfirma',
  name: 'Musterfirma GmbH',
  createdAt: '2026-08-01T10:00:00Z',
  userCount: 2,
  caseCount: 3,
};

describe('TenantsService', () => {
  let service: TenantsService;
  let httpTesting: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(TenantsService);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  async function flushList(): Promise<void> {
    TestBed.tick();
    httpTesting.expectOne('/api/tenants').flush([musterfirma]);
    await TestBed.inject(ApplicationRef).whenStable();
  }

  it('lists the tenants with the creation moment as a date', async () => {
    await flushList();

    expect(service.tenants.value()).toHaveLength(1);
    expect(service.tenants.value()[0].createdAt).toEqual(new Date('2026-08-01T10:00:00Z'));
    expect(service.tenants.value()[0].userCount).toBe(2);
  });

  it('creates, updates and removes, reloading the list each time', async () => {
    await flushList();

    const create = service.create({ name: 'Beispiel AG', slug: 'beispiel-ag' });
    const post = httpTesting.expectOne('/api/tenants');
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual({ name: 'Beispiel AG', slug: 'beispiel-ag' });
    post.flush({ ...musterfirma, id: 't2', slug: 'beispiel-ag', name: 'Beispiel AG' }, { status: 201, statusText: 'Created' });
    await create;
    await flushList();

    const update = service.update('t1', { name: 'Musterfirma AG', slug: 'musterfirma' });
    const put = httpTesting.expectOne('/api/tenants/t1');
    expect(put.request.method).toBe('PUT');
    put.flush({ ...musterfirma, name: 'Musterfirma AG' });
    await update;
    await flushList();

    const remove = service.remove('t1');
    const del = httpTesting.expectOne('/api/tenants/t1');
    expect(del.request.method).toBe('DELETE');
    del.flush(null, { status: 204, statusText: 'No Content' });
    await remove;
    await flushList();
  });

  it('lets a refused save through as the error it is', async () => {
    await flushList();

    const create = service.create({ name: 'Noch eine', slug: 'musterfirma' });
    httpTesting.expectOne('/api/tenants').flush({ reason: 'slug' }, { status: 409, statusText: 'Conflict' });

    await expect(create).rejects.toMatchObject({ status: 409, error: { reason: 'slug' } });
    httpTesting.expectNone('/api/tenants');
  });
});
