import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Table } from 'primeng/table';

import { Case } from '../model/case';
import { CaseList } from './case-list';

/**
 * What a remembered filter is worth after a reload. The table restores its own state, but a
 * PrimeNG effect wipes the filters right afterwards — see the comment on onStateRestore(). What
 * one sees then depends on whether the cases had already arrived, so both orders are tested.
 */
const translations = {
  cases: { reset: 'Reset', resetView: 'Reset view', search: 'Search', export: 'Export', delete: 'Delete', subject: 'Subject' },
};

/** A reload lands here: the search and one column filter, as the table writes them. */
const REMEMBERED = JSON.stringify({
  first: 0,
  rows: 25,
  sortField: 'lastMessageAt',
  sortOrder: -1,
  filters: {
    global: { value: 'invoice', matchMode: 'contains' },
    sender: [{ value: 'ben', matchMode: 'startsWith', operator: 'and' }],
  },
});

function aCase(overrides: Partial<Case> = {}): Case {
  return {
    id: '1',
    sender: 'anna@example.com',
    recipient: 'info@example.com',
    subject: 'Delivery status',
    receivedAt: new Date('2026-08-19T08:30:00Z'),
    lastMessageAt: new Date('2026-08-19T08:30:00Z'),
    messageCount: 1,
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
    assigneeId: null,
    assigneeName: null,
    noteCount: 0,
    ...overrides,
  };
}

/** Two cases of which exactly one answers both remembered filters. */
const twoCases = [aCase(), aCase({ id: '2', sender: 'ben@example.com', subject: 'Invoice copy' })];

describe('CaseList restored filters', () => {
  beforeEach(async () => {
    localStorage.clear();
    localStorage.setItem('frontdesk-case-table', REMEMBERED);
    await TestBed.configureTestingModule({
      imports: [
        CaseList,
        TranslocoTestingModule.forRoot({
          langs: { en: translations },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
      providers: [provideZonelessChangeDetection(), provideRouter([])],
    }).compileComponents();
  });

  function createFixture(cases: Case[]) {
    const fixture = TestBed.createComponent(CaseList);
    fixture.componentRef.setInput('cases', cases);
    fixture.detectChanges();
    return fixture;
  }

  function tableOf(fixture: ReturnType<typeof createFixture>): Table {
    return fixture.debugElement.query(By.directive(Table)).componentInstance as Table;
  }

  /** The rows carrying a case; the table also writes a heading above each stretch of time. */
  function subjectsOf(fixture: ReturnType<typeof createFixture>): string[] {
    const rows = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('tbody tr[data-p-selectable-row]');
    return [...rows].map((row) => (row.textContent ?? '').trim());
  }

  /** Both filters stand where the table keeps them, one of the two cases is left, and the box
   * says what the rows are filtered by. */
  function expectBothFiltersApplied(fixture: ReturnType<typeof createFixture>): void {
    const table = tableOf(fixture);
    expect(table.filters['global']).toMatchObject({ value: 'invoice' });
    expect(table.filters['sender']).toMatchObject([{ value: 'ben' }]);
    expect(subjectsOf(fixture)).toHaveLength(1);
    expect(subjectsOf(fixture)[0]).toContain('Invoice copy');
    expect(fixture.componentInstance['globalSearch']()).toBe('invoice');
  }

  it('brings the search and the column filter back when the cases are already there', async () => {
    const fixture = createFixture(twoCases);
    await fixture.whenStable();

    expectBothFiltersApplied(fixture);
  });

  it('brings them back just the same when the cases arrive afterwards', async () => {
    // What a reload actually looks like: the table is built before the request has answered.
    const fixture = createFixture([]);
    await fixture.whenStable();

    fixture.componentRef.setInput('cases', twoCases);
    await fixture.whenStable();

    expectBothFiltersApplied(fixture);
  });
});
