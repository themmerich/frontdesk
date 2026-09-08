import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';

import { Case } from '../model/case';
import { CaseList } from './case-list';

/** Picking rows and what follows from it; only the labels these tests press are translated. */
const translations = { cases: { delete: 'Delete', deleteRow: 'Delete case', deleteSelected: 'Delete selection' } };

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
    categoryId: null,
    categoryName: null,
    categoryColor: null,
    tier: null,
    confidence: null,
    handledAt: null,
    deletedAt: null,
    ...overrides,
  };
}

describe('CaseList selection', () => {
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

  /** Picks every case row, the way a person does: a click on the first, shift-click on the last. */
  async function pickRows(fixture: ReturnType<typeof createFixture>): Promise<void> {
    const rows = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('tbody tr[data-p-selectable-row]');
    rows[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    if (rows.length > 1) {
      rows[rows.length - 1].dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
    }
    await fixture.whenStable();
  }

  it('picks one row per click, adds with ctrl, and takes a stretch with shift', async () => {
    const fixture = createFixture([
      aCase({ subject: 'Erste' }),
      aCase({ id: '2', subject: 'Zweite' }),
      aCase({ id: '3', subject: 'Dritte' }),
    ]);
    const rows = () => Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('tbody tr[data-p-selectable-row]'));
    const picked = () => rows().filter((row) => row.getAttribute('aria-selected') === 'true');

    rows()[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await fixture.whenStable();
    expect(picked()).toHaveLength(1);

    // A plain click on another row picks that one and lets go of the first.
    rows()[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await fixture.whenStable();
    expect(picked().map((row) => row.textContent)).toHaveLength(1);
    expect(picked()[0].textContent).toContain('Zweite');

    // Held with ctrl, a click adds a row instead of replacing what is picked, and lets go of it
    // when it is clicked again.
    rows()[2].dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));
    await fixture.whenStable();
    expect(picked()).toHaveLength(2);
    rows()[2].dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));
    await fixture.whenStable();
    expect(picked()).toHaveLength(1);

    // Shift takes everything between the two, the way a file list does.
    rows()[2].dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }));
    await fixture.whenStable();
    expect(picked()).toHaveLength(2);
  });

  it('keeps the toolbar delete out of reach until something is ticked', async () => {
    const fixture = createFixture([aCase({ subject: 'Erste' }), aCase({ id: '2', subject: 'Zweite' })]);
    const requested: Case[][] = [];
    fixture.componentInstance.deleteRequested.subscribe((cases) => requested.push(cases));
    const element = fixture.nativeElement as HTMLElement;
    const toolbarDelete = Array.from(element.querySelectorAll('button')).find((button) => button.textContent?.includes('Delete'))!;

    expect(toolbarDelete.disabled).toBe(true);

    // A click picks a row; with shift, everything up to it.
    await pickRows(fixture);

    expect(toolbarDelete.disabled).toBe(false);
    toolbarDelete.click();
    await fixture.whenStable();

    expect(requested).toHaveLength(1);
    expect(requested[0].map((selected) => selected.subject).sort()).toEqual(['Erste', 'Zweite']);
  });

  it('drops deleted rows out of the selection when the list reloads', async () => {
    const fixture = createFixture([aCase({ subject: 'Erste' }), aCase({ id: '2', subject: 'Zweite' })]);
    const element = fixture.nativeElement as HTMLElement;
    await pickRows(fixture);

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
});
