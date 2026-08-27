import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { By } from '@angular/platform-browser';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Table } from 'primeng/table';

import { Case } from '../model/case';
import { CaseList } from './case-list';

const translations = {
  cases: {
    sender: 'From',
    recipient: 'To',
    subject: 'Subject',
    receivedAt: 'Received',
    category: 'Category',
    tier: 'Tier',
    tierAutomatic: 'Automatic',
    tierDraft: 'Draft',
    tierManual: 'Manual',
    tierInfo: 'Info',
    tierIgnore: 'Ignore',
    tierAll: 'All tiers',
    notTriaged: 'Not triaged yet',
    attachment: 'Attachment',
    hasAttachment: 'Has attachment',
    size: 'Size',
    filter: 'Filter …',
    columns: 'Columns',
    reset: 'Reset',
    search: 'Search',
    export: 'Export',
    delete: 'Delete',
    actions: 'Actions',
    selectAll: 'Select all',
    selectRow: 'Select case',
    deleteRow: 'Delete case',
    edit: 'Edit',
    deleteSelected: 'Delete selection',
    empty: 'No cases yet',
  },
};

/** One ingested mail, with only the fields a test actually cares about spelled out. */
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

describe('CaseList', () => {
  beforeEach(async () => {
    // The table persists what it shows, so every test starts on an empty storage rather than on
    // whatever the one before it filtered. The storage itself comes from src/test-setup.ts.
    localStorage.clear();
    // PrimeNG's overlay queries matchMedia via the document's view; JSDOM does not implement it.
    const view = document.defaultView as unknown as { matchMedia?: (query: string) => Partial<MediaQueryList> };
    view.matchMedia ??= (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    });

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

  it('renders one row per case', () => {
    const fixture = createFixture([
      aCase(),
      aCase({
        id: '2',
        sender: 'ben@example.com',
        subject: 'Invoice copy',
        receivedAt: new Date('2026-08-19T09:15:00Z'),
        hasAttachments: true,
        sizeBytes: 1.4 * 1024 * 1024,
      }),
    ]);

    const text = (fixture.nativeElement as HTMLElement).textContent;
    expect(text).toContain('anna@example.com');
    expect(text).toContain('Delivery status');
    expect(text).toContain('ben@example.com');
    expect(text).toContain('Invoice copy');
  });

  it('shows the attachment icon and the formatted size', () => {
    const fixture = createFixture([
      aCase({ subject: 'No attachment' }),
      aCase({
        id: '2',
        sender: 'ben@example.com',
        subject: 'With attachment',
        receivedAt: new Date('2026-08-19T09:15:00Z'),
        hasAttachments: true,
        sizeBytes: 1.4 * 1024 * 1024,
      }),
    ]);

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelectorAll('.pi-paperclip')).toHaveLength(1);
    expect(element.textContent).toContain('2 KB');
    expect(element.textContent).toContain('1.4 MB');
  });

  it('lets every column be resized', () => {
    const element = createFixture([]).nativeElement as HTMLElement;

    expect(element.querySelector('.p-datatable-resizable')).not.toBeNull();
    // A handle per column; the inbox has no action column beside them.
    expect(element.querySelectorAll('.p-datatable-column-resizer')).toHaveLength(8);
  });

  it('keeps the attachment header out of sight but not out of reach', () => {
    const element = createFixture([]).nativeElement as HTMLElement;

    // The first header is the selection checkbox; the attachment column follows.
    const header = element.querySelectorAll('thead th')[1];
    // The paperclip in the cells says it; the word above them only takes room.
    expect(header.textContent?.trim()).toBe('Attachment');
    expect(header.querySelector('.sr-only')?.textContent).toBe('Attachment');
  });

  it('shows the triage verdict, and a dash while a case is still waiting for it', () => {
    const element = createFixture([
      aCase({
        subject: 'Lieferung 4711',
        summary: 'Kunde fragt nach dem Liefertermin zu Bestellung 4711.',
        categoryName: 'Statusanfrage Bestellung',
        categoryColor: 'blue',
        tier: 'automatic',
        confidence: 0.95,
      }),
      aCase({ id: '2', sender: 'ben@example.com', subject: 'Noch unbewertet', receivedAt: new Date('2026-08-19T09:15:00Z') }),
    ]).nativeElement as HTMLElement;

    // The table sorts newest first, so the rows are found by their subject.
    const rows = Array.from(element.querySelectorAll('tbody tr'));
    const triaged = rows.find((row) => row.textContent?.includes('Lieferung 4711'))!;
    const waiting = rows.find((row) => row.textContent?.includes('Noch unbewertet'))!;

    expect(triaged.textContent).toContain('Statusanfrage Bestellung');
    expect(triaged.querySelector('p-tag')?.textContent?.trim()).toBe('Automatic');
    // Nothing to show yet, and the dash says so to a screen reader too.
    expect(waiting.querySelector('p-tag')).toBeNull();
    expect(waiting.querySelector('[aria-label="Not triaged yet"]')).not.toBeNull();
  });

  it('paints a row in the colour of its category, and leaves an uncoloured one alone', () => {
    const element = createFixture([
      aCase({ subject: 'Rechnung 2026-081', categoryName: 'Rechnung', categoryColor: 'amber' }),
      aCase({
        id: '2',
        sender: 'ben@example.com',
        subject: 'Ohne Farbe',
        receivedAt: new Date('2026-08-19T09:15:00Z'),
        categoryName: 'Sonstiges',
      }),
    ]).nativeElement as HTMLElement;

    // The table sorts newest first, so the rows are found by their subject.
    const rows = Array.from(element.querySelectorAll('tbody tr'));
    const coloured = rows.find((row) => row.textContent?.includes('Rechnung 2026-081'))!;
    const plain = rows.find((row) => row.textContent?.includes('Ohne Farbe'))!;

    // The row carries the palette name; styles.css turns it into a light and a
    // dark value, so no colour is ever hard-coded here.
    expect(coloured.getAttribute('data-category-color')).toBe('amber');
    expect(plain.hasAttribute('data-category-color')).toBe(false);
  });

  it('offers a multi-select for the tier column', async () => {
    const fixture = createFixture([]);

    await openFilterMenu(fixture, 5);

    const multiSelect = document.querySelector('p-multiselect') as HTMLElement;
    expect(multiSelect).not.toBeNull();
    multiSelect.click();
    await fixture.whenStable();
    const options = Array.from(document.querySelectorAll('li[role="option"]')).map((option) => option.textContent?.trim());
    // The ladder from "frontdesk answers it" to "nobody has to read it".
    expect(options).toEqual(['Automatic', 'Draft', 'Manual', 'Info', 'Ignore']);
  });

  it('asks the page to delete the row the button belongs to, not the selection', async () => {
    const fixture = createFixture([aCase({ subject: 'Weg damit' }), aCase({ id: '2', subject: 'Bleibt' })]);
    const requested: Case[][] = [];
    fixture.componentInstance.deleteRequested.subscribe((cases) => requested.push(cases));
    const element = fixture.nativeElement as HTMLElement;

    const rowWithSubject = Array.from(element.querySelectorAll('tbody tr')).find((row) => row.textContent?.includes('Weg damit'))!;
    (rowWithSubject.querySelector('button[aria-label="Delete case"]') as HTMLButtonElement).click();
    await fixture.whenStable();

    expect(requested).toHaveLength(1);
    expect(requested[0].map((selected) => selected.subject)).toEqual(['Weg damit']);
  });

  it('opens a case through the row action and through a double click', async () => {
    const fixture = createFixture([aCase({ subject: 'Rechnung 2026-081' })]);
    const opened: Case[] = [];
    const orders: string[][] = [];
    fixture.componentInstance.caseOpened.subscribe((one) => opened.push(one));
    fixture.componentInstance.orderChanged.subscribe((ids) => orders.push(ids));
    const row = (fixture.nativeElement as HTMLElement).querySelector('tbody tr')!;

    (row.querySelector('button[aria-label="Edit"]') as HTMLButtonElement).click();
    await fixture.whenStable();

    expect(opened.map((one) => one.subject)).toEqual(['Rechnung 2026-081']);
    // The detail view pages through what the table shows, so the order travels along.
    expect(orders).toEqual([['1']]);

    row.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await fixture.whenStable();

    expect(opened).toHaveLength(2);
  });

  it('does not open a case when the double click was meant for a control', async () => {
    const fixture = createFixture([aCase()]);
    const opened: Case[] = [];
    fixture.componentInstance.caseOpened.subscribe((one) => opened.push(one));

    // Ticking a row twice must select it, not open it.
    const checkbox = (fixture.nativeElement as HTMLElement).querySelector('p-table-checkbox input')!;
    checkbox.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await fixture.whenStable();

    expect(opened).toEqual([]);
  });

  it('keeps the toolbar delete out of reach until something is ticked', async () => {
    const fixture = createFixture([aCase({ subject: 'Erste' }), aCase({ id: '2', subject: 'Zweite' })]);
    const requested: Case[][] = [];
    fixture.componentInstance.deleteRequested.subscribe((cases) => requested.push(cases));
    const element = fixture.nativeElement as HTMLElement;
    const toolbarDelete = Array.from(element.querySelectorAll('button')).find((button) => button.textContent?.includes('Delete'))!;

    expect(toolbarDelete.disabled).toBe(true);

    // The header checkbox ticks every row at once.
    (element.querySelector('p-table-header-checkbox input') as HTMLInputElement).click();
    await fixture.whenStable();

    expect(toolbarDelete.disabled).toBe(false);
    toolbarDelete.click();
    await fixture.whenStable();

    expect(requested).toHaveLength(1);
    expect(requested[0].map((selected) => selected.subject).sort()).toEqual(['Erste', 'Zweite']);
  });

  it('drops deleted rows out of the selection when the list reloads', async () => {
    const fixture = createFixture([aCase({ subject: 'Erste' }), aCase({ id: '2', subject: 'Zweite' })]);
    const element = fixture.nativeElement as HTMLElement;
    (element.querySelector('p-table-header-checkbox input') as HTMLInputElement).click();
    await fixture.whenStable();

    // What the reload after a deletion looks like from here.
    fixture.componentRef.setInput('cases', [aCase({ id: '2', subject: 'Zweite' })]);
    await fixture.whenStable();

    const toolbarDelete = Array.from(element.querySelectorAll('button')).find((button) => button.textContent?.includes('Delete'))!;
    // Still one ticked, and it is the one that survived — not a stale row.
    expect(toolbarDelete.disabled).toBe(false);
    const requested: Case[][] = [];
    fixture.componentInstance.deleteRequested.subscribe((cases) => requested.push(cases));
    toolbarDelete.click();
    await fixture.whenStable();
    expect(requested[0].map((selected) => selected.subject)).toEqual(['Zweite']);
  });

  it('shows the empty message when there are no cases', () => {
    const fixture = createFixture([]);

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No cases yet');
  });

  it('renders the toolbar with column toggler, global search, export, and delete', () => {
    const fixture = createFixture([]);

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('input[aria-label="Search"]')).not.toBeNull();
    const buttonLabels = Array.from(element.querySelectorAll('p-button')).map((button) => button.textContent?.trim());
    expect(buttonLabels).toEqual(['Columns', 'Export', 'Delete']);
  });

  it('hides an unchecked column and restores it on reset', async () => {
    const fixture = createFixture([aCase()]);

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelectorAll('th')).toHaveLength(10);

    const columnsButton = element.querySelector('p-button button') as HTMLButtonElement;
    columnsButton.click();
    await fixture.whenStable();

    const subjectCheckbox = document.querySelector('input#subject') as HTMLInputElement;
    expect(subjectCheckbox).not.toBeNull();
    subjectCheckbox.click();
    await fixture.whenStable();

    expect(element.querySelectorAll('th')).toHaveLength(9);
    expect(element.textContent).not.toContain('Delivery status');

    const resetButton = Array.from(document.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Reset'),
    ) as HTMLButtonElement;
    expect(resetButton).toBeDefined();
    resetButton.click();
    await fixture.whenStable();

    expect(element.querySelectorAll('th')).toHaveLength(10);
    expect(element.textContent).toContain('Delivery status');
  });

  it('reports a hidden column to the caller, which is what gets persisted', async () => {
    const fixture = createFixture([]);

    const columnsButton = (fixture.nativeElement as HTMLElement).querySelector('p-button button') as HTMLButtonElement;
    columnsButton.click();
    await fixture.whenStable();

    (document.querySelector('input#subject') as HTMLInputElement).click();
    await fixture.whenStable();

    expect(fixture.componentInstance.visibleFields()).toEqual([
      'hasAttachments',
      'sender',
      'recipient',
      'category',
      'tier',
      'receivedAt',
      'sizeBytes',
    ]);
  });

  it('offers sorting on sender, subject, size, and received, and a filter on all but the size', () => {
    const fixture = createFixture([]);

    const element = fixture.nativeElement as HTMLElement;
    // The attachment column filters without sorting, the size column does the opposite.
    // Sortable: sender, recipient, subject, category, tier, received at, size.
    // Filterable: everything but the size.
    expect(element.querySelectorAll('p-sorticon')).toHaveLength(7);
    expect(element.querySelectorAll('p-columnfilter')).toHaveLength(7);
  });

  // Filter toggle order matches the column order: attachment, sender, recipient,
  // subject, category, tier, received at. The size has no filter.
  async function openFilterMenu(fixture: ReturnType<typeof createFixture>, index: number): Promise<void> {
    const filterToggles = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('p-columnfilter button');
    filterToggles[index].click();
    await fixture.whenStable();
  }

  it('offers a tri-state checkbox for the attachment column', async () => {
    const fixture = createFixture([]);

    await openFilterMenu(fixture, 0);

    expect(document.querySelector('p-checkbox')).not.toBeNull();
  });

  it('offers a date filter for the received-at column', async () => {
    const fixture = createFixture([]);

    await openFilterMenu(fixture, 6);

    expect(document.querySelector('p-datepicker')).not.toBeNull();
  });

  it('sorts the size column by its byte value, not by the rendered unit', async () => {
    const fixture = createFixture([
      // 900 KB reads "bigger" than "1.4 MB" only if the text is compared.
      aCase({ subject: 'Small with the bigger unit', sizeBytes: 900 * 1024 }),
      aCase({
        id: '2',
        sender: 'ben@example.com',
        subject: 'Large with the smaller number',
        receivedAt: new Date('2026-08-19T09:15:00Z'),
        hasAttachments: true,
        sizeBytes: 1.4 * 1024 * 1024,
      }),
    ]);
    const table = fixture.debugElement.query(By.directive(Table)).componentInstance as Table;

    table.sort({ field: 'sizeBytes', order: 1 });
    await fixture.whenStable();

    // Fifth cell: checkbox, attachment, sender, recipient, subject.
    const subjects = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr')).map((row) =>
      row.querySelectorAll('td')[4].textContent?.trim(),
    );
    expect(subjects).toEqual(['Small with the bigger unit', 'Large with the smaller number']);
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

  it('filters the rows down to the cases with an attachment', async () => {
    const fixture = createFixture([
      aCase(),
      aCase({
        id: '2',
        sender: 'ben@example.com',
        subject: 'Invoice copy',
        receivedAt: new Date('2026-08-19T09:15:00Z'),
        hasAttachments: true,
        sizeBytes: 4096,
      }),
    ]);
    const table = fixture.debugElement.query(By.directive(Table)).componentInstance as Table;

    table.filter(true, 'hasAttachments', 'equals');
    // The table applies filters after its debounce delay (300 ms by default).
    await new Promise((resolve) => setTimeout(resolve, 400));
    await fixture.whenStable();

    const text = (fixture.nativeElement as HTMLElement).textContent;
    expect(text).toContain('Invoice copy');
    expect(text).not.toContain('Delivery status');
  });
});
