import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationRef, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { Case } from '../model/case';
import { CasesService } from './cases-service';

describe('CasesService', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), provideHttpClient(), provideHttpClientTesting()],
    });
  });

  it('loads the cases from the API and parses the ISO date into a Date', async () => {
    // The wire shape: receivedAt arrives as an ISO string.
    const response = [
      {
        id: '1',
        sender: 'anna@example.com',
        subject: 'Delivery status',
        receivedAt: '2026-08-19T08:30:00Z',
        hasAttachments: false,
        sizeBytes: 2048,
        summary: null,
        categoryName: null,
        tier: null,
        confidence: null,
      },
    ];
    const service = TestBed.inject(CasesService);
    const httpTesting = TestBed.inject(HttpTestingController);
    TestBed.tick();

    httpTesting.expectOne('/api/cases').flush(response);
    await TestBed.inject(ApplicationRef).whenStable();

    const expected: Case[] = [{ ...response[0], receivedAt: new Date('2026-08-19T08:30:00Z') }];
    expect(service.cases.value()).toEqual(expected);
    // The table's date filter compares real Date objects.
    expect(service.cases.value()[0].receivedAt).toBeInstanceOf(Date);
    httpTesting.verify();
  });

  it('starts with an empty list before the API answered', async () => {
    const service = TestBed.inject(CasesService);

    expect(service.cases.value()).toEqual([]);
  });

  /** The visibility state is a getter, so it has to be redefined rather than assigned. */
  function setVisibility(state: DocumentVisibilityState) {
    Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
  }

  describe('keeping the list current', () => {
    afterEach(() => {
      vi.useRealTimers();
      setVisibility('visible');
    });

    it('reloads on its own while the tab is visible', async () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
      setVisibility('visible');
      const service = TestBed.inject(CasesService);
      const httpTesting = TestBed.inject(HttpTestingController);
      TestBed.tick();
      httpTesting.expectOne('/api/cases').flush([]);
      await TestBed.inject(ApplicationRef).whenStable();

      // Mail arrives while the page just sits there.
      vi.advanceTimersByTime(10_000);
      TestBed.tick();

      httpTesting.expectOne('/api/cases').flush([]);
      expect(service.cases.value()).toEqual([]);
      httpTesting.verify();
    });

    it('spares a hidden tab the request', async () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
      setVisibility('hidden');
      TestBed.inject(CasesService);
      const httpTesting = TestBed.inject(HttpTestingController);
      TestBed.tick();
      httpTesting.expectOne('/api/cases').flush([]);
      await TestBed.inject(ApplicationRef).whenStable();

      vi.advanceTimersByTime(30_000);
      TestBed.tick();

      // Nobody is looking, so nothing is asked.
      httpTesting.verify();
    });

    it('refreshes right away when the tab is looked at again', async () => {
      setVisibility('hidden');
      TestBed.inject(CasesService);
      const httpTesting = TestBed.inject(HttpTestingController);
      TestBed.tick();
      httpTesting.expectOne('/api/cases').flush([]);
      await TestBed.inject(ApplicationRef).whenStable();

      setVisibility('visible');
      document.dispatchEvent(new Event('visibilitychange'));
      TestBed.tick();

      // No waiting for the next tick — the rows are current the moment they are seen.
      httpTesting.expectOne('/api/cases').flush([]);
      httpTesting.verify();
    });
  });
});
