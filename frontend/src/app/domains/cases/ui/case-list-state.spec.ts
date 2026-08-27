import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Table } from 'primeng/table';

import { Case } from '../model/case';
import { DEFAULT_COLUMN_ORDER } from '../model/case-column';
import { CaseList } from './case-list';

/**
 * What the table remembers, and what it forgets again on demand. Only the two labels the tests
 * press are translated; the rest render as their keys.
 */
const translations = {
  cases: { reset: 'Reset', resetView: 'Reset view', search: 'Search', export: 'Export', delete: 'Delete', subject: 'Subject' },
};

function aCase(overrides: Partial<Case> = {}): Case {
  return {
    id: '1',
    sender: 'anna@example.com',
    recipient: 'info@example.com',
    subject: 'Delivery status',
    receivedAt: new Date('2026-08-19T08:30:00Z'),
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

describe('CaseList remembered state', () => {
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

  function createFixture(cases: Case[] = [aCase()]) {
    const fixture = TestBed.createComponent(CaseList);
    fixture.componentRef.setInput('cases', cases);
    fixture.detectChanges();
    return fixture;
  }

  /** JSDOM lays nothing out, so the header cells are told how wide they are. */
  function measureHeadersAs(fixture: ReturnType<typeof createFixture>, widths: number[]): void {
    const headers = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('thead th[data-column]');
    headers.forEach((header, index) => (header.getBoundingClientRect = () => ({ width: widths[index] }) as DOMRect));
  }

  it('remembers a dragged width under the column it belongs to', async () => {
    const fixture = createFixture();
    const table = fixture.debugElement.query(By.directive(Table)).componentInstance as Table;
    // The tick, the eight columns, the row actions — as they stand by default.
    measureHeadersAs(fixture, [48, 65, 200, 150, 300, 150, 130, 190, 90, 100]);

    table.onColResize.emit({ element: document.createElement('th'), delta: -40 });
    await fixture.whenStable();

    // Not only the column that was dragged: in fit mode every width is a share of the same table.
    expect(fixture.componentInstance.columnWidths()).toEqual({
      __selection: 48,
      hasAttachments: 65,
      sender: 200,
      recipient: 150,
      subject: 300,
      categoryName: 150,
      tier: 130,
      receivedAt: 190,
      sizeBytes: 90,
      __actions: 100,
    });
  });

  it('hands the table the widths of the columns it actually shows', async () => {
    const fixture = createFixture();
    const table = fixture.debugElement.query(By.directive(Table)).componentInstance as Table;
    fixture.componentRef.setInput('columnWidths', {
      __selection: 48,
      hasAttachments: 65,
      sender: 200,
      recipient: 150,
      subject: 300,
      categoryName: 150,
      tier: 130,
      receivedAt: 190,
      sizeBytes: 90,
      __actions: 100,
    });
    fixture.componentRef.setInput('visibleFields', ['sender', 'subject']);
    await fixture.whenStable();

    table.saveState();

    // Sender keeps its 200 although the column in front of it is gone — by position it would
    // have inherited the 65 of the attachment column.
    const stored = JSON.parse(localStorage.getItem('frontdesk-case-table') ?? '{}') as Record<string, unknown>;
    expect(stored['columnWidths']).toBe('48,200,300,100');
  });

  function pressButton(fixture: ReturnType<typeof createFixture>, label: string): void {
    const buttons = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button'));
    buttons.find((button) => button.textContent?.trim() === label)!.click();
  }

  it('forgets sorting, filters, search and columns when the view is reset', async () => {
    const fixture = createFixture();
    const table = fixture.debugElement.query(By.directive(Table)).componentInstance as Table;
    fixture.componentRef.setInput('visibleFields', ['sender']);
    fixture.componentRef.setInput('columnWidths', { sender: 200 });
    table.sort({ field: 'subject' });
    table.filter('anna', 'sender', 'startsWith');
    await fixture.whenStable();
    table.saveState();
    expect(localStorage.getItem('frontdesk-case-table')).not.toBeNull();

    pressButton(fixture, 'Reset view');
    await fixture.whenStable();

    // The table as it comes: newest first, nothing filtered, every column back and unsized.
    expect(table.sortField).toBe('receivedAt');
    expect(table.sortOrder).toBe(-1);
    expect(table.filteredValue).toBeNull();
    expect(fixture.componentInstance.visibleFields()).toEqual([...DEFAULT_COLUMN_ORDER]);
    expect(fixture.componentInstance.columnWidths()).toEqual({});
    // And nothing of it is left in the storage; the page drops its own entry along with it.
    expect(localStorage.getItem('frontdesk-case-table')).toBeNull();
  });

  it('fills a page where the stored state knows nothing of a paginator', async () => {
    // What the storage holds for everyone who used the inbox before it had one. PrimeNG hands
    // the missing entries on as undefined, and the table then shows nothing at all.
    localStorage.setItem('frontdesk-case-table', JSON.stringify({ sortField: 'receivedAt', sortOrder: -1 }));

    const fixture = createFixture([aCase(), aCase({ id: '2', subject: 'Invoice copy' })]);
    await fixture.whenStable();

    const table = fixture.debugElement.query(By.directive(Table)).componentInstance as Table;
    expect(table.rows()).toBe(25);
    expect(table.first()).toBe(0);
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr')).toHaveLength(2);
  });

  it('remembers how many rows a page holds, but not the page one stood on', () => {
    const fixture = createFixture();
    const table = fixture.debugElement.query(By.directive(Table)).componentInstance as Table;

    // Read back without awaiting: paging writes the state on the spot, and a debounced filter
    // left over from another test would otherwise get its write in first.
    table.onPageChange({ first: 50, rows: 50 });

    const stored = JSON.parse(localStorage.getItem('frontdesk-case-table') ?? '{}') as Record<string, unknown>;
    expect(stored['rows']).toBe(50);
    // Mail arrives at the top, so the inbox opens there rather than where it was left.
    expect(stored['first']).toBeUndefined();
  });

  it('drops the widths when the columns are reset', async () => {
    const fixture = createFixture();
    fixture.componentRef.setInput('columnWidths', { sender: 200, subject: 300 });
    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;
    (element.querySelector('p-button button') as HTMLButtonElement).click();
    await fixture.whenStable();
    const reset = Array.from(document.querySelectorAll('button')).find((button) => button.textContent?.trim() === 'Reset')!;
    reset.click();
    await fixture.whenStable();

    // Reset means the table as it comes, so the dragged widths go with the order and the choice.
    expect(fixture.componentInstance.columnWidths()).toEqual({});
  });

  it('keeps out of the way while a shown column has no width of its own', async () => {
    const fixture = createFixture();
    const table = fixture.debugElement.query(By.directive(Table)).componentInstance as Table;
    // Only two of the ten rendered columns were ever measured.
    fixture.componentRef.setInput('columnWidths', { sender: 200, subject: 300 });
    await fixture.whenStable();

    table.saveState();

    // A gap in the list would shift every column behind it, so nothing is handed over at all.
    const stored = JSON.parse(localStorage.getItem('frontdesk-case-table') ?? '{}') as Record<string, unknown>;
    expect(stored['columnWidths']).toBeUndefined();
  });

  it('exports the visible columns, which a stateful table does not know by itself', async () => {
    const fixture = createFixture([aCase({ subject: 'Rechnung 2026-081' })]);
    const exported: Blob[] = [];
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockImplementation((blob: Blob | MediaSource) => {
      exported.push(blob as Blob);
      return 'blob:export';
    });

    const element = fixture.nativeElement as HTMLElement;

    Array.from(element.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Export'))!
      .click();
    await fixture.whenStable();

    const csv = await exported[0].text();
    expect(csv).toContain('"Subject"');
    expect(csv).toContain('"Rechnung 2026-081"');
    createObjectURL.mockRestore();
  });

  it('still renders where a storage is missing, only without remembering anything', () => {
    const view = document.defaultView!;
    const { localStorage: storage } = view;
    Object.defineProperty(view, 'localStorage', { value: undefined, configurable: true });

    expect((createFixture([aCase()]).nativeElement as HTMLElement).textContent).toContain('Delivery status');

    Object.defineProperty(view, 'localStorage', { value: storage, configurable: true });
  });

  it('hands the search over to the next table on the same key, but not the ticked rows', async () => {
    const cases = [aCase(), aCase({ id: '2', sender: 'ben@example.com', subject: 'Invoice copy' })];
    const fixture = createFixture(cases);
    const element = fixture.nativeElement as HTMLElement;
    const search = element.querySelector('input[aria-label="Search"]') as HTMLInputElement;

    search.value = 'invoice';
    search.dispatchEvent(new Event('input'));
    (element.querySelector('p-table-header-checkbox input') as HTMLInputElement).click();
    // The table applies filters after its debounce delay (300 ms by default).
    await new Promise((resolve) => setTimeout(resolve, 400));
    await fixture.whenStable();
    fixture.destroy();

    // What a reload — or the walk to the detail view and back — looks like from here.
    const second = createFixture(cases);
    await second.whenStable();

    const restored = second.nativeElement as HTMLElement;
    // The rows come back filtered, and the box says what they are filtered by.
    expect(restored.textContent).toContain('Invoice copy');
    expect(restored.textContent).not.toContain('Delivery status');
    expect((restored.querySelector('input[aria-label="Search"]') as HTMLInputElement).value).toBe('invoice');
    // A tick is meant for the next click, not for tomorrow: it stays out of the stored state,
    // where it would put mails back that have been deleted in the meantime.
    expect(localStorage.getItem('frontdesk-case-table')).not.toContain('selection');
    expect(Array.from(restored.querySelectorAll('button')).find((button) => button.textContent?.includes('Delete'))!.disabled).toBe(true);
  });
});
