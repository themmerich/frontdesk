import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Table } from 'primeng/table';

import { Case } from '../model/case';
import { CaseList } from './case-list';

/**
 * What the table remembers of a dragged column width. The labels play no part here, so the
 * translations stay empty and the headers render as their keys.
 */
function aCase(): Case {
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
  };
}

describe('CaseList column widths', () => {
  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [
        CaseList,
        TranslocoTestingModule.forRoot({ langs: { en: {} }, translocoConfig: { availableLangs: ['en'], defaultLang: 'en' } }),
      ],
      providers: [provideZonelessChangeDetection(), provideRouter([])],
    }).compileComponents();
  });

  function createFixture() {
    const fixture = TestBed.createComponent(CaseList);
    fixture.componentRef.setInput('cases', [aCase()]);
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
      category: 150,
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
      category: 150,
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

  it('drops the widths when the columns are reset', async () => {
    const fixture = createFixture();
    fixture.componentRef.setInput('columnWidths', { sender: 200, subject: 300 });
    await fixture.whenStable();

    const element = fixture.nativeElement as HTMLElement;
    (element.querySelector('p-button button') as HTMLButtonElement).click();
    await fixture.whenStable();
    const reset = Array.from(document.querySelectorAll('button')).find((button) => button.textContent?.includes('cases.reset'))!;
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
});
