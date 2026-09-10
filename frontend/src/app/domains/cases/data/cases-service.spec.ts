import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApplicationRef, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { Case } from '../model/case';
import { CasesService } from './cases-service';

/** One case as it comes off the wire, without the two moments the piles are decided by. */
const onTheWire = {
  sender: 'anna@example.com',
  recipient: 'info@example.com',
  subject: 'Delivery status',
  receivedAt: '2026-08-19T08:30:00Z',
  hasAttachments: false,
  sizeBytes: 2048,
  summary: null,
  categoryId: null,
  categoryName: null,
  categoryColor: null,
  tier: null,
  confidence: null,
};

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
        recipient: 'info@example.com',
        subject: 'Delivery status',
        receivedAt: '2026-08-19T08:30:00Z',
        hasAttachments: false,
        sizeBytes: 2048,
        summary: null,
        categoryId: null,
        categoryName: null,
        categoryColor: null,
        tier: null,
        confidence: null,
        handledAt: null,
        deletedAt: null,
        hasDraft: false,
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

  it('marks a case as taken note of, takes it back, and reloads either way', async () => {
    const service = TestBed.inject(CasesService);
    const httpTesting = TestBed.inject(HttpTestingController);
    TestBed.tick();
    httpTesting.expectOne('/api/cases').flush([]);
    await TestBed.inject(ApplicationRef).whenStable();

    const marked = service.markHandled('1', true);
    const request = httpTesting.expectOne('/api/cases/1/handled');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ handled: true });
    request.flush({});
    await marked;

    // What the review shows is what the backend holds, not what was hoped for.
    TestBed.tick();
    httpTesting.expectOne('/api/cases').flush([]);

    const takenBack = service.markHandled('1', false);
    const undo = httpTesting.expectOne('/api/cases/1/handled');
    expect(undo.request.body).toEqual({ handled: false });
    undo.flush({});
    await takenBack;

    TestBed.tick();
    httpTesting.expectOne('/api/cases').flush([]);
    httpTesting.verify();
  });

  it('parses when a case was taken note of, and leaves it null while it is not', async () => {
    const service = TestBed.inject(CasesService);
    const httpTesting = TestBed.inject(HttpTestingController);
    TestBed.tick();

    httpTesting.expectOne('/api/cases').flush([
      { ...onTheWire, id: '1', handledAt: '2026-08-20T09:00:00Z' },
      { ...onTheWire, id: '2', handledAt: null },
      // An answer without the field at all: a case nobody has taken note of, not one carrying
      // an Invalid Date that would quietly drop out of the review.
      { ...onTheWire, id: '3' },
    ]);
    await TestBed.inject(ApplicationRef).whenStable();

    expect(service.cases.value()[0].handledAt).toEqual(new Date('2026-08-20T09:00:00Z'));
    expect(service.cases.value()[1].handledAt).toBeNull();
    expect(service.cases.value()[2].handledAt).toBeNull();
    httpTesting.verify();
  });

  it('tells the open cases from the archived ones, so neither page shows the other pile', async () => {
    const service = TestBed.inject(CasesService);
    const httpTesting = TestBed.inject(HttpTestingController);
    TestBed.tick();

    httpTesting.expectOne('/api/cases').flush([
      { ...onTheWire, id: '1', handledAt: null },
      { ...onTheWire, id: '2', handledAt: '2026-08-20T09:00:00Z' },
      { ...onTheWire, id: '3', handledAt: null },
    ]);
    await TestBed.inject(ApplicationRef).whenStable();

    expect(service.openCases().map((aCase) => aCase.id)).toEqual(['1', '3']);
    expect(service.archivedCases().map((aCase) => aCase.id)).toEqual(['2']);
    httpTesting.verify();
  });

  it('puts what was thrown away in the trash, whether it was worked through or not', async () => {
    const service = TestBed.inject(CasesService);
    const httpTesting = TestBed.inject(HttpTestingController);
    TestBed.tick();

    httpTesting.expectOne('/api/cases').flush([
      { ...onTheWire, id: '1', handledAt: null, deletedAt: null },
      { ...onTheWire, id: '2', handledAt: '2026-08-20T09:00:00Z', deletedAt: null },
      { ...onTheWire, id: '3', handledAt: null, deletedAt: '2026-08-21T09:00:00Z' },
      { ...onTheWire, id: '4', handledAt: '2026-08-20T09:00:00Z', deletedAt: '2026-08-21T10:00:00Z' },
    ]);
    await TestBed.inject(ApplicationRef).whenStable();

    expect(service.openCases().map((aCase) => aCase.id)).toEqual(['1']);
    expect(service.archivedCases().map((aCase) => aCase.id)).toEqual(['2']);
    expect(service.trashedCases().map((aCase) => aCase.id)).toEqual(['3', '4']);
    // What the dashboard counts: everything that was not thrown away.
    expect(service.activeCases().map((aCase) => aCase.id)).toEqual(['1', '2']);
    expect(service.trashedCases()[0].deletedAt).toEqual(new Date('2026-08-21T09:00:00Z'));
    httpTesting.verify();
  });

  it('throws a selection away, fetches it back, and deletes it for good — reloading each time', async () => {
    const service = TestBed.inject(CasesService);
    const httpTesting = TestBed.inject(HttpTestingController);
    TestBed.tick();
    httpTesting.expectOne('/api/cases').flush([]);
    await TestBed.inject(ApplicationRef).whenStable();

    const thrownAway = service.remove(['1', '2']);
    const trashing = httpTesting.expectOne('/api/cases');
    expect(trashing.request.method).toBe('DELETE');
    expect(trashing.request.body).toEqual({ ids: ['1', '2'] });
    trashing.flush(null);
    await thrownAway;
    TestBed.tick();
    httpTesting.expectOne('/api/cases').flush([]);

    const back = service.restore(['1']);
    const restoring = httpTesting.expectOne('/api/cases/restore');
    expect(restoring.request.method).toBe('PUT');
    expect(restoring.request.body).toEqual({ ids: ['1'] });
    restoring.flush(null);
    await back;
    TestBed.tick();
    httpTesting.expectOne('/api/cases').flush([]);

    const forGood = service.purge(['2']);
    const purging = httpTesting.expectOne('/api/cases/purge');
    expect(purging.request.method).toBe('DELETE');
    expect(purging.request.body).toEqual({ ids: ['2'] });
    purging.flush(null);
    await forGood;
    TestBed.tick();
    httpTesting.expectOne('/api/cases').flush([]);
    httpTesting.verify();
  });

  it('keeps the list it has while a reload brings back the same cases, and takes a changed one', async () => {
    const service = TestBed.inject(CasesService);
    const httpTesting = TestBed.inject(HttpTestingController);
    TestBed.tick();
    httpTesting.expectOne('/api/cases').flush([{ ...onTheWire, id: '1' }]);
    await TestBed.inject(ApplicationRef).whenStable();
    const before = service.cases.value();

    // Most polls: nothing has happened. The list stays the very same, so nothing built on it —
    // the rows of the inbox, the page one stands on — is touched.
    service.cases.reload();
    TestBed.tick();
    httpTesting.expectOne('/api/cases').flush([{ ...onTheWire, id: '1' }]);
    await TestBed.inject(ApplicationRef).whenStable();
    expect(service.cases.value()).toBe(before);

    // The triage has looked at the case since: that is news, and gets through.
    service.cases.reload();
    TestBed.tick();
    httpTesting.expectOne('/api/cases').flush([{ ...onTheWire, id: '1', tier: 'manual' }]);
    await TestBed.inject(ApplicationRef).whenStable();
    expect(service.cases.value()).not.toBe(before);
    expect(service.cases.value()[0].tier).toBe('manual');
    httpTesting.verify();
  });

  it('holds both piles empty while the list could not be loaded', async () => {
    const service = TestBed.inject(CasesService);
    const httpTesting = TestBed.inject(HttpTestingController);
    TestBed.tick();

    // value() throws in the error state; neither page may fall over that.
    httpTesting.expectOne('/api/cases').error(new ProgressEvent('offline'));
    await TestBed.inject(ApplicationRef).whenStable();

    expect(service.openCases()).toEqual([]);
    expect(service.archivedCases()).toEqual([]);
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
