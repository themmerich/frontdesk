import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationRef, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { AuthStore } from '../../shared/data/auth-store';
import { NotificationsService } from './notifications-service';

describe('NotificationsService', () => {
  const hasTenant = signal(true);

  function setUp() {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthStore, useValue: { hasTenant } as unknown as AuthStore },
      ],
    });
    return {
      service: TestBed.inject(NotificationsService),
      http: TestBed.inject(HttpTestingController),
    };
  }

  beforeEach(() => hasTenant.set(true));

  it('reads the count and what is behind it, with the moment as a Date', async () => {
    const { service, http } = setUp();
    // The resource only fires once something reads it.
    expect(service.unseenCount()).toBe(0);

    TestBed.tick();
    http.expectOne('/api/notifications').flush({
      unseenCount: 2,
      items: [{ caseId: 'c1', subject: 'Lieferung 4711', type: 'follow_up_received', actorName: null, occurredAt: '2026-08-19T08:30:00Z' }],
    });
    await TestBed.inject(ApplicationRef).whenStable();

    expect(service.unseenCount()).toBe(2);
    expect(service.items()[0].subject).toBe('Lieferung 4711');
    expect(service.items()[0].occurredAt).toBeInstanceOf(Date);
    http.verify();
  });

  it('asks for nothing while no tenant is open', () => {
    hasTenant.set(false);
    const { service, http } = setUp();

    expect(service.unseenCount()).toBe(0);
    TestBed.tick();

    // A super-user who has opened no tenant has no inbox to be notified about, and the endpoint
    // would answer 403.
    http.expectNone('/api/notifications');
    http.verify();
  });

  it('marks nothing seen while no tenant is open', async () => {
    hasTenant.set(false);
    const { service, http } = setUp();

    await service.markSeen();

    http.expectNone('/api/notifications/seen');
    http.verify();
  });

  it('keeps the count standing until somebody says they have read it', async () => {
    const { service, http } = setUp();
    TestBed.tick();
    http.expectOne('/api/notifications').flush({ unseenCount: 1, items: [] });
    await TestBed.inject(ApplicationRef).whenStable();
    expect(service.unseenCount()).toBe(1);

    const seen = service.markSeen();
    http.expectOne({ method: 'POST', url: '/api/notifications/seen' }).flush(null);
    await seen;

    // Marking reloads, so what stands afterwards is what the backend holds.
    TestBed.tick();
    http.expectOne('/api/notifications').flush({ unseenCount: 0, items: [] });
    await TestBed.inject(ApplicationRef).whenStable();
    expect(service.unseenCount()).toBe(0);
    http.verify();
  });
});
