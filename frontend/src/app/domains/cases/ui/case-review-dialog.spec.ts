import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Table } from 'primeng/table';

import { Case } from '../model/case';
import { ReviewGroup } from '../model/case-review';
import { CaseReviewDialog } from './case-review-dialog';

const translations = {
  cases: {
    category: 'Category',
    tier: 'Tier',
    actions: 'Actions',
    delete: 'Delete',
    noCategory: 'Without a category',
    notTriaged: 'Not triaged yet',
    tierAutomatic: 'Automatic',
    tierDraft: 'Draft',
    tierManual: 'Manual',
    tierInfo: 'Info',
    tierIgnore: 'Ignore',
    reviewTitle: 'Review',
    reviewCaption: 'Cases by category and tier',
    reviewCount: 'Count',
    reviewSummaries: 'Summaries',
    reviewSummariesGroup: 'Summaries: {{category}}',
    reviewNoSummary: 'No summary available.',
    reviewDelete: 'Delete {{category}} ({{count}})',
    reviewShow: 'Show',
    reviewShowGroup: 'Show {{category}}',
    reviewEmpty: 'Nothing left to review.',
    reviewNoMatch: 'No group matches the filter.',
    reviewClose: 'Close',
    categoryAll: 'All categories',
    tierAll: 'All tiers',
  },
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

const ads = { categoryId: 'ads', categoryName: 'Ads', categoryColor: 'grey' as const, tier: 'ignore' as const };
const jobs = { categoryId: 'jobs', categoryName: 'Job offers', categoryColor: 'teal' as const, tier: 'info' as const };
const claims = { categoryId: 'claims', categoryName: 'Claims', categoryColor: 'red' as const, tier: 'manual' as const };

describe('CaseReviewDialog', () => {
  beforeEach(async () => {
    // PrimeNG's dialog queries matchMedia for its breakpoints; JSDOM does not implement it.
    const view = document.defaultView as unknown as { matchMedia?: (query: string) => Partial<MediaQueryList> };
    view.matchMedia ??= (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    });

    await TestBed.configureTestingModule({
      imports: [
        CaseReviewDialog,
        TranslocoTestingModule.forRoot({
          langs: { en: translations },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
  });

  async function openDialog(cases: Case[]): Promise<ComponentFixture<CaseReviewDialog>> {
    const fixture = TestBed.createComponent(CaseReviewDialog);
    fixture.componentRef.setInput('cases', cases);
    fixture.componentRef.setInput('visible', true);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  }

  /** The dialog's rows, as PrimeNG renders them, wherever it put them. */
  function rows(): HTMLTableRowElement[] {
    return Array.from(document.querySelectorAll<HTMLTableRowElement>('.p-dialog tbody tr'));
  }

  /** The categories in the order the table renders them. */
  function categories(): (string | undefined)[] {
    return rows().map((row) => row.querySelector('td')?.textContent?.trim());
  }

  function button(name: string): HTMLButtonElement {
    const found = Array.from(document.querySelectorAll<HTMLButtonElement>('.p-dialog button')).find(
      (candidate) => candidate.getAttribute('aria-label') === name || candidate.textContent?.trim() === name,
    );
    expect(found, `button "${name}"`).toBeDefined();
    return found!;
  }

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('shows one line per category and tier, with the count and the tier as a tag', async () => {
    await openDialog([aCase({ id: '1', ...ads }), aCase({ id: '2', ...ads }), aCase({ id: '3', ...jobs })]);

    const lines = rows().map((row) => row.textContent?.replace(/\s+/g, ' ').trim());
    expect(lines[0]).toContain('Ads');
    expect(lines[0]).toContain('Ignore');
    expect(lines[0]).toContain('2');
    expect(lines[1]).toContain('Job offers');
    expect(lines[1]).toContain('Info');
    expect(rows()[0].dataset['categoryColor']).toBe('grey');
    expect(rows()[0].querySelector('p-tag')).not.toBeNull();
  });

  it('lets every group be looked at, and adds to that what its tier allows', async () => {
    await openDialog([aCase({ id: '1', ...ads }), aCase({ id: '2', ...jobs }), aCase({ id: '3', ...claims }), aCase({ id: '4' })]);

    const names = rows().map((row) =>
      Array.from(row.querySelectorAll('button')).map((candidate) => candidate.getAttribute('aria-label') ?? candidate.textContent?.trim()),
    );
    expect(names).toEqual([
      ['Show Ads', 'Delete Ads (1)'],
      ['Show Job offers', 'Summaries: Job offers', 'Delete Job offers (1)'],
      ['Show Claims'],
      ['Show Without a category'],
    ]);
  });

  it('lets its columns be resized, taking the width off the neighbour', async () => {
    const fixture = await openDialog([aCase({ id: '1', ...ads })]);
    const table = fixture.debugElement.query(By.directive(Table)).componentInstance as Table;

    // Fit mode: the table keeps its width and the neighbour gives what a column takes.
    expect(table.columnResizeMode()).toBe('fit');
    expect(document.querySelector('.p-datatable-resizable')).not.toBeNull();
    // One handle per column that can give or take; the actions at the end need none.
    expect(document.querySelectorAll('.p-dialog thead .p-datatable-column-resizer')).toHaveLength(3);
  });

  it('stands the actions at the left edge of their column, under their heading', async () => {
    await openDialog([aCase({ id: '1', ...ads })]);

    const actions = rows()[0].querySelectorAll('td')[3].firstElementChild as HTMLElement;
    expect(actions.className).not.toContain('justify-end');
  });

  it('says what its buttons do without writing it next to them', async () => {
    await openDialog([aCase({ id: '1', ...jobs })]);

    for (const candidate of rows()[0].querySelectorAll('button')) {
      // An icon and a tooltip; the word itself would be a wall of text down the column.
      expect(candidate.textContent?.trim()).toBe('');
      expect(candidate.getAttribute('aria-label')).not.toBeNull();
      expect(candidate.querySelector('.pi')).not.toBeNull();
    }
  });

  it('sorts by the count, and by where a tier stands rather than by its word', async () => {
    const fixture = await openDialog([
      aCase({ id: '1', ...claims }),
      aCase({ id: '2', ...jobs }),
      aCase({ id: '3', ...jobs }),
      aCase({ id: '4', ...ads }),
      aCase({ id: '5', ...ads }),
      aCase({ id: '6', ...ads }),
    ]);
    const table = fixture.debugElement.query(By.directive(Table)).componentInstance as Table;

    // Unsorted, the review order: what needs nobody first, the biggest pile of a tier before the
    // smaller ones.
    expect(categories()).toEqual(['Ads', 'Job offers', 'Claims']);

    table.sortField = 'count';
    table.sortOrder = 1;
    table.sortSingle();
    fixture.detectChanges();
    expect(categories()).toEqual(['Claims', 'Job offers', 'Ads']);

    // By tier, the ladder of the review: ignore, info, manual — not the alphabet, which would
    // put "manual" between them.
    table.sortField = 'tierRank';
    table.sortOrder = 1;
    table.sortSingle();
    fixture.detectChanges();
    expect(categories()).toEqual(['Ads', 'Job offers', 'Claims']);
  });

  it('filters by category, by tier and by how many a group holds', async () => {
    const fixture = await openDialog([
      aCase({ id: '1', ...ads }),
      aCase({ id: '2', ...ads }),
      aCase({ id: '3', ...jobs }),
      aCase({ id: '4', ...claims }),
      aCase({ id: '5' }),
    ]);
    const table = fixture.debugElement.query(By.directive(Table)).componentInstance as Table;

    async function filterBy(value: unknown, field: string, matchMode: string) {
      table.filter(value, field, matchMode);
      // The table applies filters after its debounce delay (300 ms by default).
      await new Promise((resolve) => setTimeout(resolve, 400));
      fixture.detectChanges();
    }

    await filterBy(['Ads', 'Claims'], 'categoryLabel', 'in');
    expect(categories()).toEqual(['Ads', 'Claims']);

    await filterBy(null, 'categoryLabel', 'in');
    // A tier the triage never gave is a value like any other in the filter.
    await filterBy([null], 'tier', 'in');
    expect(categories()).toEqual(['Without a category']);

    await filterBy(null, 'tier', 'in');
    await filterBy(2, 'count', 'gte');
    expect(categories()).toEqual(['Ads']);

    await filterBy(9, 'count', 'gte');
    // The one row left is the table's word for it, not a group.
    expect(categories()).toEqual(['No group matches the filter.']);
  });

  it('offers as filter values only the categories and tiers it actually holds', async () => {
    const fixture = await openDialog([aCase({ id: '1', ...ads }), aCase({ id: '2', ...jobs })]);
    const dialog = fixture.componentInstance as unknown as {
      categoryOptions: () => string[];
      tierOptions: () => { label: string; value: string | null }[];
    };

    expect(dialog.categoryOptions()).toEqual(['Ads', 'Job offers']);
    // In the order the review works through them, not in the one they were written in.
    expect(dialog.tierOptions()).toEqual([
      { label: 'Ignore', value: 'ignore' },
      { label: 'Info', value: 'info' },
    ]);
  });

  it('asks for the whole group to be deleted', async () => {
    const fixture = await openDialog([aCase({ id: '1', ...ads }), aCase({ id: '2', ...jobs }), aCase({ id: '3', ...ads })]);
    const requested: Case[][] = [];
    fixture.componentInstance.deleteRequested.subscribe((cases) => requested.push(cases));

    button('Delete Ads (2)').click();

    expect(requested.map((cases) => cases.map((row) => row.id))).toEqual([['1', '3']]);
  });

  it('hands a group over to be shown, and gets out of the way', async () => {
    const fixture = await openDialog([aCase({ id: '1', ...ads }), aCase({ id: '2', ...claims })]);
    const shown: ReviewGroup[] = [];
    fixture.componentInstance.groupShown.subscribe((group) => shown.push(group));

    button('Show Claims').click();

    expect(shown.map((group) => [group.categoryName, group.tier])).toEqual([['Claims', 'manual']]);
    expect(fixture.componentInstance.visible()).toBe(false);
  });

  it('hands an info group over to be read, and gets out of the way', async () => {
    const fixture = await openDialog([aCase({ id: '1', ...jobs }), aCase({ id: '2', ...ads })]);
    const requested: ReviewGroup[] = [];
    fixture.componentInstance.summariesRequested.subscribe((group) => requested.push(group));

    button('Summaries: Job offers').click();

    // The summaries have a page of their own; the dialog would only stand in front of it.
    expect(requested.map((group) => [group.categoryName, group.tier])).toEqual([['Job offers', 'info']]);
    expect(fixture.componentInstance.visible()).toBe(false);
  });

  it('says when there is nothing left', async () => {
    await openDialog([]);

    expect(document.body.textContent).toContain('Nothing left to review.');
    expect(rows()).toHaveLength(0);
  });

  it('drops a group once its cases are gone, and keeps the dialog open', async () => {
    const fixture = await openDialog([aCase({ id: '1', ...ads }), aCase({ id: '2', ...jobs })]);
    expect(rows()).toHaveLength(2);

    fixture.componentRef.setInput('cases', [aCase({ id: '2', ...jobs })]);
    fixture.detectChanges();

    expect(rows()).toHaveLength(1);
    expect(rows()[0].textContent).toContain('Job offers');
    expect(fixture.componentInstance.visible()).toBe(true);
  });
});
