import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Table } from 'primeng/table';

import { Case } from '../model/case';
import { CaseList } from './case-list';

/** The stretches of time the inbox files its cases under. */
const translations = {
  cases: { groupToday: 'Today', groupYesterday: 'Yesterday', groupThisWeek: 'This week', groupThisMonth: 'This month' },
};

function daysAgo(days: number, hour = 9): Date {
  const then = new Date();
  then.setDate(then.getDate() - days);
  then.setHours(hour, 0, 0, 0);
  return then;
}

function aCase(overrides: Partial<Case> = {}): Case {
  return {
    id: '1',
    sender: 'anna@example.com',
    recipient: 'info@example.com',
    subject: 'Delivery status',
    receivedAt: new Date(),
    hasAttachments: false,
    sizeBytes: 2048,
    summary: null,
    categoryName: null,
    categoryColor: null,
    tier: null,
    confidence: null,
    ...overrides,
  };
}

describe('CaseList date groups', () => {
  beforeEach(async () => {
    localStorage.clear();
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

  /** The headings the table writes between the rows, in the order they stand. */
  function headings(fixture: ReturnType<typeof createFixture>): string[] {
    const rows = (fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr:not(:has(p-table-checkbox))');
    return Array.from(rows).map((row) => row.textContent?.trim() ?? '');
  }

  it('files the cases under the stretch of time they came in, newest first', () => {
    // Sixty days back is the month before last at the earliest, so the last heading is a month.
    const fixture = createFixture([
      aCase({ receivedAt: daysAgo(0) }),
      aCase({ id: '2', receivedAt: daysAgo(1) }),
      aCase({ id: '3', receivedAt: daysAgo(60) }),
    ]);

    const written = headings(fixture);
    expect(written[0]).toBe('Today');
    expect(written[1]).toBe('Yesterday');
    // The oldest is named after its month, whatever month that happens to be today.
    expect(written).toHaveLength(3);
    expect(written[2]).not.toBe('This month');
  });

  it('writes one heading per stretch, however many cases fall into it', () => {
    const fixture = createFixture([
      aCase({ receivedAt: daysAgo(0, 8) }),
      aCase({ id: '2', receivedAt: daysAgo(0, 10) }),
      aCase({ id: '3', receivedAt: daysAgo(0, 12) }),
    ]);

    expect(headings(fixture)).toEqual(['Today']);
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr:has(p-table-checkbox)')).toHaveLength(3);
  });

  it('steps aside when the list is put in another order', async () => {
    const fixture = createFixture([aCase({ receivedAt: daysAgo(0) }), aCase({ id: '2', receivedAt: daysAgo(1) })]);
    const table = fixture.debugElement.query(By.directive(Table)).componentInstance as Table;
    expect(headings(fixture)).toEqual(['Today', 'Yesterday']);

    // Sorted by sender, the stretches would cut the alphabet into pieces.
    table.sort({ field: 'sender' });
    await fixture.whenStable();

    expect(headings(fixture)).toEqual([]);
  });
});
