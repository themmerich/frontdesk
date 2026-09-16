import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';

import { Case } from '../model/case';
import { CaseList } from './case-list';

/** Who has a case, and the list narrowed to one person; only the labels these tests press. */
const translations = {
  cases: {
    assignee: 'Assigned to',
    assigneeAll: 'Everybody',
    assigneeNobody: 'Nobody',
    mine: 'My cases',
    mineHint: 'Shows only the cases assigned to you.',
  },
};

/**
 * Each case a minute older than the one made before it. The table sorts newest first, so the rows
 * stand in the order a test lists its cases — every time. Dated off the clock, two cases would
 * share a millisecond now and then, and the sort would put them in whichever order it liked.
 */
let lastReceivedAt = Date.UTC(2026, 7, 19, 8, 0);

function aCase(overrides: Partial<Case> = {}): Case {
  lastReceivedAt -= 60_000;
  return {
    id: '1',
    sender: 'anna@example.com',
    recipient: 'info@example.com',
    subject: 'Delivery status',
    receivedAt: new Date(lastReceivedAt),
    lastMessageAt: new Date(lastReceivedAt),
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

describe('CaseList assignment', () => {
  beforeEach(async () => {
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

  /** The assignee column sits seventh; the size column is the one without a filter, and it is last. */
  async function openAssigneeFilter(fixture: ReturnType<typeof createFixture>): Promise<void> {
    const toggles = (fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('p-columnfilter button');
    toggles[6].click();
    await fixture.whenStable();
  }

  it('names who has a case and leaves a dash where nobody does', () => {
    const element = createFixture([aCase({ assigneeId: 'u1', assigneeName: 'Ben Beispiel' }), aCase({ id: '2', subject: 'Offen' })])
      .nativeElement as HTMLElement;

    const rows = Array.from(element.querySelectorAll('tbody tr[data-p-selectable-row]'));
    expect(rows[0].textContent).toContain('Ben Beispiel');
    // Not the word "Nobody" in every row of a queue that mostly belongs to nobody.
    expect(rows[1].textContent).not.toContain('Nobody');
  });

  it('offers the people the inbox is spread across, with nobody in front', async () => {
    const fixture = createFixture([
      aCase({ assigneeId: 'u2', assigneeName: 'Zora Zuletzt' }),
      aCase({ id: '2', assigneeId: 'u1', assigneeName: 'Ben Beispiel' }),
      aCase({ id: '3' }),
    ]);

    await openAssigneeFilter(fixture);
    const multiSelect = document.querySelector('p-multiselect') as HTMLElement;
    multiSelect.click();
    await fixture.whenStable();

    const options = Array.from(document.querySelectorAll('li[role="option"]')).map((option) => option.textContent?.trim());
    expect(options).toEqual(['Nobody', 'Ben Beispiel', 'Zora Zuletzt']);
  });

  it('narrows the list to the signed-in person and hands it back', async () => {
    const fixture = createFixture([
      aCase({ assigneeId: 'u1', assigneeName: 'Anna Muster' }),
      aCase({ id: '2', subject: 'Von jemand anderem', assigneeId: 'u2', assigneeName: 'Ben Beispiel' }),
      aCase({ id: '3', subject: 'Offen' }),
    ]);
    fixture.componentRef.setInput('currentUserName', 'Anna Muster');
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const mine = Array.from(element.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('My cases'),
    ) as HTMLButtonElement;

    mine.click();
    // The table applies filters after its debounce delay (300 ms by default).
    await new Promise((resolve) => setTimeout(resolve, 400));
    await fixture.whenStable();

    expect(element.querySelectorAll('tbody tr[data-p-selectable-row]')).toHaveLength(1);
    expect(element.textContent).not.toContain('Von jemand anderem');
    expect(element.textContent).not.toContain('Offen');

    mine.click();
    await new Promise((resolve) => setTimeout(resolve, 400));
    await fixture.whenStable();

    // Pressed again it is a filter like any other: it goes, and everything is back.
    expect(element.querySelectorAll('tbody tr[data-p-selectable-row]')).toHaveLength(3);
  });

  it('hands a case to a colleague through the row, saying only what was picked', async () => {
    const fixture = createFixture([aCase()]);
    fixture.componentRef.setInput('assignableUsers', [{ id: 'u1', name: 'Ben Beispiel' }]);
    fixture.detectChanges();
    const changes: { id: string; userId: string | null }[] = [];
    fixture.componentInstance.assignmentChanged.subscribe((change) => changes.push(change));
    const element = fixture.nativeElement as HTMLElement;

    // The cell opens its picker on a click, the way the category and the tier do.
    const cell = element.querySelectorAll('tbody tr[data-p-selectable-row] td')[6] as HTMLElement;
    cell.click();
    await fixture.whenStable();
    (element.querySelector('p-select') as HTMLElement).click();
    await fixture.whenStable();
    const ben = Array.from(document.querySelectorAll('li[role="option"]')).find((option) =>
      option.textContent?.includes('Ben Beispiel'),
    ) as HTMLElement;
    ben.click();
    await fixture.whenStable();

    expect(changes).toEqual([{ id: '1', userId: 'u1' }]);
  });
});
