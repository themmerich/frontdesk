import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { FilterMetadata } from 'primeng/api';
import { Table } from 'primeng/table';

import { Case } from '../model/case';
import { ReviewGroup } from '../model/case-review';
import { CaseList } from './case-list';

const translations = {
  cases: {
    sender: 'From',
    subject: 'Subject',
    category: 'Category',
    tier: 'Tier',
    tierManual: 'Manual',
    tierIgnore: 'Ignore',
    noCategory: 'Without a category',
    review: 'Review',
    reviewTitle: 'Review',
    reviewSummaries: 'Summaries',
    reviewSummariesGroup: 'Summaries: {{category}}',
    tierInfo: 'Info',
    reviewDelete: 'Delete {{category}} ({{count}})',
    reviewShow: 'Show',
    reviewShowGroup: 'Show {{category}}',
    delete: 'Delete',
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
    ...overrides,
  };
}

const ads = { categoryId: 'ads', categoryName: 'Ads', categoryColor: 'grey' as const, tier: 'ignore' as const };
const claims = { categoryId: 'claims', categoryName: 'Claims', categoryColor: 'red' as const, tier: 'manual' as const };

/** The list with the review in it: what the dialog asks for, the list does. */
describe('CaseList review', () => {
  beforeEach(async () => {
    localStorage.clear();
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

  afterEach(() => {
    document.body.innerHTML = '';
  });

  const cases = [
    aCase({ id: '1', ...ads }),
    aCase({ id: '2', ...ads, sender: 'shop@example.com' }),
    aCase({ id: '3', ...claims }),
    aCase({ id: '4' }),
  ];

  async function openReview(): Promise<ComponentFixture<CaseList>> {
    const fixture = TestBed.createComponent(CaseList);
    fixture.componentRef.setInput('cases', cases);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    Array.from(element.querySelectorAll('button'))
      .find((candidate) => candidate.textContent?.trim() === 'Review')!
      .click();
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture;
  }

  function dialogButton(name: string): HTMLButtonElement {
    const found = Array.from(document.querySelectorAll<HTMLButtonElement>('.p-dialog button')).find(
      (candidate) => candidate.getAttribute('aria-label') === name,
    );
    expect(found, `button "${name}"`).toBeDefined();
    return found!;
  }

  function table(fixture: ComponentFixture<CaseList>): Table {
    return fixture.debugElement.query(By.directive(Table)).componentInstance as Table;
  }

  it('opens the review from the toolbar', async () => {
    await openReview();

    expect(document.querySelector('.p-dialog')).not.toBeNull();
    expect(document.querySelector('.p-dialog')?.textContent).toContain('Ads');
  });

  it('filters the table down to the group that is to be shown, and to nothing else', async () => {
    const fixture = await openReview();
    const primeTable = table(fixture);
    // Something filtered and searched before; showing a group means only that group.
    primeTable.filters['sender'] = [{ value: 'anna', matchMode: 'contains', operator: 'and' }];
    primeTable.filters['global'] = { value: 'anna', matchMode: 'contains' };
    primeTable._filter();

    dialogButton('Show Claims').click();
    fixture.detectChanges();

    const constraint = (field: string) => (primeTable.filters[field] as FilterMetadata[])[0];
    expect(constraint('categoryName')).toEqual({ value: ['Claims'], matchMode: 'in', operator: 'and' });
    expect(constraint('tier')).toEqual({ value: ['manual'], matchMode: 'in', operator: 'and' });
    expect(constraint('sender').value).toBeNull();
    expect(primeTable.filters['global']).toBeUndefined();
    expect((primeTable.filteredValue as Case[]).map((row) => row.id)).toEqual(['3']);
    // The dialog is out of the way, the search box is empty.
    expect(document.querySelector('.p-dialog')).toBeNull();
    expect((fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>('input[type="text"]')?.value).toBe('');
  });

  it('shows the cases the triage has not seen, which have neither category nor tier', async () => {
    const fixture = await openReview();

    dialogButton('Show Without a category').click();
    fixture.detectChanges();

    expect((table(fixture).filteredValue as Case[]).map((row) => row.id)).toEqual(['4']);
  });

  it('passes a wish to read a group on to the page, which knows the route', async () => {
    const fixture = TestBed.createComponent(CaseList);
    fixture.componentRef.setInput('cases', [aCase({ id: '5', categoryId: 'news', categoryName: 'News', tier: 'info' })]);
    fixture.detectChanges();
    const requested: ReviewGroup[] = [];
    fixture.componentInstance.summariesRequested.subscribe((group) => requested.push(group));
    // The review is opened from the outside here, the way the page opens it on the way back.
    fixture.componentInstance.reviewOpen.set(true);
    fixture.detectChanges();
    await fixture.whenStable();

    dialogButton('Summaries: News').click();

    expect(requested.map((group) => [group.categoryName, group.tier])).toEqual([['News', 'info']]);
    expect(fixture.componentInstance.reviewOpen()).toBe(false);
  });

  it('passes a deletion from the review on as a deletion', async () => {
    const fixture = await openReview();
    const requested: Case[][] = [];
    fixture.componentInstance.deleteRequested.subscribe((requestedCases) => requested.push(requestedCases));

    dialogButton('Delete Ads (2)').click();

    expect(requested.map((requestedCases) => requestedCases.map((row) => row.id))).toEqual([['1', '2']]);
  });
});
