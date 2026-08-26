import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
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
    summary: 'Request',
    category: 'Category',
    confidence: 'Confidence',
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
    empty: 'No cases yet',
  },
};

describe('CaseList', () => {
  beforeEach(async () => {
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
      providers: [provideZonelessChangeDetection()],
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
      {
        id: '1',
        sender: 'anna@example.com',
        recipient: 'info@example.com',
        subject: 'Delivery status',
        receivedAt: new Date('2026-08-19T08:30:00Z'),
        hasAttachments: false,
        sizeBytes: 2048,
        summary: null,
        categoryName: null,
        tier: null,
        confidence: null,
      },
      {
        id: '2',
        sender: 'ben@example.com',
        recipient: 'info@example.com',
        subject: 'Invoice copy',
        receivedAt: new Date('2026-08-19T09:15:00Z'),
        hasAttachments: true,
        sizeBytes: 1.4 * 1024 * 1024,
        summary: null,
        categoryName: null,
        tier: null,
        confidence: null,
      },
    ]);

    const text = (fixture.nativeElement as HTMLElement).textContent;
    expect(text).toContain('anna@example.com');
    expect(text).toContain('Delivery status');
    expect(text).toContain('ben@example.com');
    expect(text).toContain('Invoice copy');
  });

  it('shows the attachment icon and the formatted size', () => {
    const fixture = createFixture([
      {
        id: '1',
        sender: 'anna@example.com',
        recipient: 'info@example.com',
        subject: 'No attachment',
        receivedAt: new Date('2026-08-19T08:30:00Z'),
        hasAttachments: false,
        sizeBytes: 2048,
        summary: null,
        categoryName: null,
        tier: null,
        confidence: null,
      },
      {
        id: '2',
        sender: 'ben@example.com',
        recipient: 'info@example.com',
        subject: 'With attachment',
        receivedAt: new Date('2026-08-19T09:15:00Z'),
        hasAttachments: true,
        sizeBytes: 1.4 * 1024 * 1024,
        summary: null,
        categoryName: null,
        tier: null,
        confidence: null,
      },
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
    expect(element.querySelectorAll('.p-datatable-column-resizer')).toHaveLength(10);
  });

  it('keeps the attachment header out of sight but not out of reach', () => {
    const element = createFixture([]).nativeElement as HTMLElement;

    const header = element.querySelectorAll('thead th')[0];
    // The paperclip in the cells says it; the word above them only takes room.
    expect(header.textContent?.trim()).toBe('Attachment');
    expect(header.querySelector('.sr-only')?.textContent).toBe('Attachment');
  });

  it('shows the triage verdict, and a dash while a case is still waiting for it', () => {
    const element = createFixture([
      {
        id: '1',
        sender: 'anna@example.com',
        recipient: 'info@example.com',
        subject: 'Lieferung 4711',
        receivedAt: new Date('2026-08-19T08:30:00Z'),
        hasAttachments: false,
        sizeBytes: 2048,
        summary: 'Kunde fragt nach dem Liefertermin zu Bestellung 4711.',
        categoryName: 'Statusanfrage Bestellung',
        tier: 'automatic',
        confidence: 0.95,
      },
      {
        id: '2',
        sender: 'ben@example.com',
        recipient: 'info@example.com',
        subject: 'Noch unbewertet',
        receivedAt: new Date('2026-08-19T09:15:00Z'),
        hasAttachments: false,
        sizeBytes: 2048,
        summary: null,
        categoryName: null,
        tier: null,
        confidence: null,
      },
    ]).nativeElement as HTMLElement;

    // The table sorts newest first, so the rows are found by their subject.
    const rows = Array.from(element.querySelectorAll('tbody tr'));
    const triaged = rows.find((row) => row.textContent?.includes('Lieferung 4711'))!;
    const waiting = rows.find((row) => row.textContent?.includes('Noch unbewertet'))!;

    expect(triaged.textContent).toContain('Statusanfrage Bestellung');
    expect(triaged.querySelector('p-tag')?.textContent?.trim()).toBe('Automatic');
    // What the sender wants, in one sentence, plus how sure the model was.
    expect(triaged.textContent).toContain('Kunde fragt nach dem Liefertermin zu Bestellung 4711.');
    expect(triaged.textContent).toContain('95%');
    // Nothing to show yet, and the dash says so to a screen reader too.
    expect(waiting.querySelector('p-tag')).toBeNull();
    expect(waiting.querySelector('[aria-label="Not triaged yet"]')).not.toBeNull();
  });

  it('offers a multi-select for the tier column', async () => {
    const fixture = createFixture([]);

    await openFilterMenu(fixture, 6);

    const multiSelect = document.querySelector('p-multiselect') as HTMLElement;
    expect(multiSelect).not.toBeNull();
    multiSelect.click();
    await fixture.whenStable();
    const options = Array.from(document.querySelectorAll('li[role="option"]')).map((option) => option.textContent?.trim());
    // The ladder from "frontdesk answers it" to "nobody has to read it".
    expect(options).toEqual(['Automatic', 'Draft', 'Manual', 'Info', 'Ignore']);
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
    const fixture = createFixture([
      {
        id: '1',
        sender: 'anna@example.com',
        recipient: 'info@example.com',
        subject: 'Delivery status',
        receivedAt: new Date('2026-08-19T08:30:00Z'),
        hasAttachments: false,
        sizeBytes: 2048,
        summary: null,
        categoryName: null,
        tier: null,
        confidence: null,
      },
    ]);

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
      'summary',
      'category',
      'tier',
      'confidence',
      'receivedAt',
      'sizeBytes',
    ]);
  });

  it('offers sorting on sender, subject, size, and received, and a filter on all but the size', () => {
    const fixture = createFixture([]);

    const element = fixture.nativeElement as HTMLElement;
    // The attachment column filters without sorting, the size column does the opposite.
    // Sortable: sender, recipient, subject, category, tier, confidence, received at, size.
    // Filterable: everything but the size and the confidence.
    expect(element.querySelectorAll('p-sorticon')).toHaveLength(8);
    expect(element.querySelectorAll('p-columnfilter')).toHaveLength(8);
  });

  // Filter toggle order matches the column order: attachment, sender, recipient,
  // subject, request, category, tier, received at. The confidence has no filter.
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

    await openFilterMenu(fixture, 7);

    expect(document.querySelector('p-datepicker')).not.toBeNull();
  });

  it('sorts the size column by its byte value, not by the rendered unit', async () => {
    const fixture = createFixture([
      {
        id: '1',
        sender: 'anna@example.com',
        recipient: 'info@example.com',
        subject: 'Small with the bigger unit',
        receivedAt: new Date('2026-08-19T08:30:00Z'),
        hasAttachments: false,
        // 900 KB reads "bigger" than "1.4 MB" only if the text is compared.
        sizeBytes: 900 * 1024,
        summary: null,
        categoryName: null,
        tier: null,
        confidence: null,
      },
      {
        id: '2',
        sender: 'ben@example.com',
        recipient: 'info@example.com',
        subject: 'Large with the smaller number',
        receivedAt: new Date('2026-08-19T09:15:00Z'),
        hasAttachments: true,
        sizeBytes: 1.4 * 1024 * 1024,
        summary: null,
        categoryName: null,
        tier: null,
        confidence: null,
      },
    ]);
    const table = fixture.debugElement.query(By.directive(Table)).componentInstance as Table;

    table.sort({ field: 'sizeBytes', order: 1 });
    await fixture.whenStable();

    // Fourth cell: attachment, sender, recipient, subject.
    const subjects = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr')).map((row) =>
      row.querySelectorAll('td')[3].textContent?.trim(),
    );
    expect(subjects).toEqual(['Small with the bigger unit', 'Large with the smaller number']);
  });

  it('filters the rows down to the cases with an attachment', async () => {
    const fixture = createFixture([
      {
        id: '1',
        sender: 'anna@example.com',
        recipient: 'info@example.com',
        subject: 'Delivery status',
        receivedAt: new Date('2026-08-19T08:30:00Z'),
        hasAttachments: false,
        sizeBytes: 2048,
        summary: null,
        categoryName: null,
        tier: null,
        confidence: null,
      },
      {
        id: '2',
        sender: 'ben@example.com',
        recipient: 'info@example.com',
        subject: 'Invoice copy',
        receivedAt: new Date('2026-08-19T09:15:00Z'),
        hasAttachments: true,
        sizeBytes: 4096,
        summary: null,
        categoryName: null,
        tier: null,
        confidence: null,
      },
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
