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
    subject: 'Subject',
    receivedAt: 'Received',
    attachment: 'Attachment',
    hasAttachment: 'Has attachment',
    size: 'Size',
    filter: 'Filter …',
    columns: 'Columns',
    reset: 'Reset',
    search: 'Search …',
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
        subject: 'Delivery status',
        receivedAt: new Date('2026-08-19T08:30:00Z'),
        hasAttachments: false,
        sizeBytes: 2048,
      },
      {
        id: '2',
        sender: 'ben@example.com',
        subject: 'Invoice copy',
        receivedAt: new Date('2026-08-19T09:15:00Z'),
        hasAttachments: true,
        sizeBytes: 1.4 * 1024 * 1024,
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
        subject: 'No attachment',
        receivedAt: new Date('2026-08-19T08:30:00Z'),
        hasAttachments: false,
        sizeBytes: 2048,
      },
      {
        id: '2',
        sender: 'ben@example.com',
        subject: 'With attachment',
        receivedAt: new Date('2026-08-19T09:15:00Z'),
        hasAttachments: true,
        sizeBytes: 1.4 * 1024 * 1024,
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
    expect(element.querySelectorAll('.p-datatable-column-resizer')).toHaveLength(5);
  });

  it('shows the empty message when there are no cases', () => {
    const fixture = createFixture([]);

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No cases yet');
  });

  it('renders the toolbar with column toggler, global search, export, and delete', () => {
    const fixture = createFixture([]);

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('input[aria-label="Search …"]')).not.toBeNull();
    const buttonLabels = Array.from(element.querySelectorAll('p-button')).map((button) => button.textContent?.trim());
    expect(buttonLabels).toEqual(['Columns', 'Export', 'Delete']);
  });

  it('hides an unchecked column and restores it on reset', async () => {
    const fixture = createFixture([
      {
        id: '1',
        sender: 'anna@example.com',
        subject: 'Delivery status',
        receivedAt: new Date('2026-08-19T08:30:00Z'),
        hasAttachments: false,
        sizeBytes: 2048,
      },
    ]);

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelectorAll('th')).toHaveLength(5);

    const columnsButton = element.querySelector('p-button button') as HTMLButtonElement;
    columnsButton.click();
    await fixture.whenStable();

    const subjectCheckbox = document.querySelector('input#subject') as HTMLInputElement;
    expect(subjectCheckbox).not.toBeNull();
    subjectCheckbox.click();
    await fixture.whenStable();

    expect(element.querySelectorAll('th')).toHaveLength(4);
    expect(element.textContent).not.toContain('Delivery status');

    const resetButton = Array.from(document.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('Reset'),
    ) as HTMLButtonElement;
    expect(resetButton).toBeDefined();
    resetButton.click();
    await fixture.whenStable();

    expect(element.querySelectorAll('th')).toHaveLength(5);
    expect(element.textContent).toContain('Delivery status');
  });

  it('reports a hidden column to the caller, which is what gets persisted', async () => {
    const fixture = createFixture([]);

    const columnsButton = (fixture.nativeElement as HTMLElement).querySelector('p-button button') as HTMLButtonElement;
    columnsButton.click();
    await fixture.whenStable();

    (document.querySelector('input#subject') as HTMLInputElement).click();
    await fixture.whenStable();

    expect(fixture.componentInstance.visibleFields()).toEqual(['hasAttachments', 'sender', 'receivedAt', 'sizeBytes']);
  });

  it('offers sorting on sender, subject, size, and received, and a filter on all but the size', () => {
    const fixture = createFixture([]);

    const element = fixture.nativeElement as HTMLElement;
    // The attachment column filters without sorting, the size column does the opposite.
    expect(element.querySelectorAll('p-sorticon')).toHaveLength(4);
    expect(element.querySelectorAll('p-columnfilter')).toHaveLength(4);
  });

  // Filter toggle order matches the column order: attachment, sender, subject, received at.
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

    await openFilterMenu(fixture, 3);

    expect(document.querySelector('p-datepicker')).not.toBeNull();
  });

  it('sorts the size column by its byte value, not by the rendered unit', async () => {
    const fixture = createFixture([
      {
        id: '1',
        sender: 'anna@example.com',
        subject: 'Small with the bigger unit',
        receivedAt: new Date('2026-08-19T08:30:00Z'),
        hasAttachments: false,
        // 900 KB reads "bigger" than "1.4 MB" only if the text is compared.
        sizeBytes: 900 * 1024,
      },
      {
        id: '2',
        sender: 'ben@example.com',
        subject: 'Large with the smaller number',
        receivedAt: new Date('2026-08-19T09:15:00Z'),
        hasAttachments: true,
        sizeBytes: 1.4 * 1024 * 1024,
      },
    ]);
    const table = fixture.debugElement.query(By.directive(Table)).componentInstance as Table;

    table.sort({ field: 'sizeBytes', order: 1 });
    await fixture.whenStable();

    const subjects = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr')).map((row) =>
      row.querySelectorAll('td')[2].textContent?.trim(),
    );
    expect(subjects).toEqual(['Small with the bigger unit', 'Large with the smaller number']);
  });

  it('filters the rows down to the cases with an attachment', async () => {
    const fixture = createFixture([
      {
        id: '1',
        sender: 'anna@example.com',
        subject: 'Delivery status',
        receivedAt: new Date('2026-08-19T08:30:00Z'),
        hasAttachments: false,
        sizeBytes: 2048,
      },
      {
        id: '2',
        sender: 'ben@example.com',
        subject: 'Invoice copy',
        receivedAt: new Date('2026-08-19T09:15:00Z'),
        hasAttachments: true,
        sizeBytes: 4096,
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
