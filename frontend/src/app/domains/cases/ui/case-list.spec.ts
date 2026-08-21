import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';

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
        receivedAt: '2026-08-19T08:30:00Z',
        hasAttachments: false,
        sizeBytes: 2048,
      },
      {
        id: '2',
        sender: 'ben@example.com',
        subject: 'Invoice copy',
        receivedAt: '2026-08-19T09:15:00Z',
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
        receivedAt: '2026-08-19T08:30:00Z',
        hasAttachments: false,
        sizeBytes: 2048,
      },
      {
        id: '2',
        sender: 'ben@example.com',
        subject: 'With attachment',
        receivedAt: '2026-08-19T09:15:00Z',
        hasAttachments: true,
        sizeBytes: 1.4 * 1024 * 1024,
      },
    ]);

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelectorAll('.pi-paperclip')).toHaveLength(1);
    expect(element.textContent).toContain('2 KB');
    expect(element.textContent).toContain('1.4 MB');
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
        receivedAt: '2026-08-19T08:30:00Z',
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

  it('offers sorting on sender, subject, size, and received, and filters for sender and subject', () => {
    const fixture = createFixture([]);

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelectorAll('p-sorticon')).toHaveLength(4);
    expect(element.querySelectorAll('p-columnfilter')).toHaveLength(2);
  });
});
