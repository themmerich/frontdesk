import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Table } from 'primeng/table';

import { Case } from '../model/case';
import { CaseList } from './case-list';

/** Only the labels the table needs to render its toolbar; everything else renders as its key. */
const translations = {
  cases: { reset: 'Reset', resetView: 'Reset view', search: 'Search', export: 'Export', delete: 'Delete', subject: 'Subject' },
};

/** So many cases, one a minute, newest first — enough for the table to page them. */
function manyCases(count: number): Case[] {
  return Array.from({ length: count }, (_, index) => ({
    id: String(index),
    sender: 'anna@example.com',
    recipient: 'info@example.com',
    subject: `Vorgang ${index}`,
    receivedAt: new Date(Date.UTC(2026, 7, 19, 8, index)),
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
  }));
}

/** One more, newer than all of them: what a poll brings back after a mail came in. */
function arrived(): Case {
  return { ...manyCases(1)[0], id: 'new', subject: 'Neu eingetroffen', receivedAt: new Date(Date.UTC(2026, 7, 19, 9, 0)) };
}

describe('CaseList paging', () => {
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

  async function createFixture(cases: Case[]) {
    const fixture = TestBed.createComponent(CaseList);
    fixture.componentRef.setInput('cases', cases);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  }

  function tableOf(fixture: Awaited<ReturnType<typeof createFixture>>): Table {
    return fixture.debugElement.query(By.directive(Table)).componentInstance as Table;
  }

  /** The rows carrying a case; the table also writes a heading above each stretch of time. */
  function rowCount(fixture: Awaited<ReturnType<typeof createFixture>>): number {
    return (fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr[data-p-selectable-row]').length;
  }

  it('stays on the page one is on when the list is handed new rows', async () => {
    const fixture = await createFixture(manyCases(30));
    const table = tableOf(fixture);
    table.onPageChange({ first: 25, rows: 25 });
    await fixture.whenStable();
    expect(rowCount(fixture)).toBe(5);

    // What the poll hands over: the same list with a new mail at the top of it.
    fixture.componentRef.setInput('cases', [arrived(), ...manyCases(30)]);
    await fixture.whenStable();

    expect(table.first()).toBe(25);
    expect(rowCount(fixture)).toBe(6);
  });

  it('starts over on the first page when a person sorts, and stays there through the next reload', async () => {
    const fixture = await createFixture(manyCases(30));
    const table = tableOf(fixture);
    table.onPageChange({ first: 25, rows: 25 });
    await fixture.whenStable();

    table.sort({ field: 'sender' });
    await fixture.whenStable();
    expect(table.first()).toBe(0);

    fixture.componentRef.setInput('cases', [arrived(), ...manyCases(30)]);
    await fixture.whenStable();
    expect(table.first()).toBe(0);
  });

  it('starts over on the first page when a person filters, and stays there through the next reload', async () => {
    const fixture = await createFixture(manyCases(30));
    const table = tableOf(fixture);
    table.onPageChange({ first: 25, rows: 25 });
    await fixture.whenStable();

    table.filter('Vorgang', 'subject', 'contains');
    // The table applies filters after its debounce delay (300 ms by default).
    await new Promise((resolve) => setTimeout(resolve, 400));
    await fixture.whenStable();
    expect(table.first()).toBe(0);

    fixture.componentRef.setInput('cases', [arrived(), ...manyCases(30)]);
    await fixture.whenStable();
    expect(table.first()).toBe(0);
  });

  it('falls back onto the last page there still is when the list grows shorter', async () => {
    const fixture = await createFixture(manyCases(60));
    const table = tableOf(fixture);
    table.onPageChange({ first: 50, rows: 25 });
    await fixture.whenStable();

    // Half the list thrown away elsewhere: the third page is gone with it.
    fixture.componentRef.setInput('cases', manyCases(30));
    await fixture.whenStable();

    expect(table.first()).toBe(25);
    expect(rowCount(fixture)).toBe(5);
  });
});
