import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';

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
    reviewClose: 'Close',
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

  it('offers the actions of the tier: delete for ignore, summaries and delete for info, show for the rest', async () => {
    await openDialog([aCase({ id: '1', ...ads }), aCase({ id: '2', ...jobs }), aCase({ id: '3', ...claims }), aCase({ id: '4' })]);

    const names = rows().map((row) =>
      Array.from(row.querySelectorAll('button')).map((candidate) => candidate.getAttribute('aria-label') ?? candidate.textContent?.trim()),
    );
    expect(names).toEqual([
      ['Delete Ads (1)'],
      ['Summaries: Job offers', 'Delete Job offers (1)'],
      ['Show Claims'],
      ['Show Without a category'],
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

  it('unfolds the summaries of an info group, and says so where there is none', async () => {
    const fixture = await openDialog([
      aCase({ id: '1', ...jobs, subject: 'Senior developer', summary: 'Agency offers a senior role in Berlin.' }),
      aCase({ id: '2', ...jobs, subject: 'Junior developer', summary: null }),
    ]);
    const toggle = button('Summaries: Job offers');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(document.body.textContent).not.toContain('Agency offers');

    toggle.click();
    fixture.detectChanges();

    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const list = document.getElementById(toggle.getAttribute('aria-controls')!);
    expect(list?.textContent).toContain('Senior developer');
    expect(list?.textContent).toContain('Agency offers a senior role in Berlin.');
    expect(list?.textContent).toContain('Junior developer');
    expect(list?.textContent).toContain('No summary available.');

    toggle.click();
    fixture.detectChanges();

    expect(document.body.textContent).not.toContain('Agency offers');
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
