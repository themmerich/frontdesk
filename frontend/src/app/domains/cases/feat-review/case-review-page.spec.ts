import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { MessageService, ToastMessageOptions } from 'primeng/api';

import { CaseOrderStore } from '../data/case-order-store';
import { CasesService } from '../data/cases-service';
import { Case } from '../model/case';
import { CaseReviewPage } from './case-review-page';

const translations = {
  cases: {
    noCategory: 'Without a category',
    tierInfo: 'Info',
    tierIgnore: 'Ignore',
  },
  caseReview: {
    backToReview: 'Back to the review',
    oneCase: '1 case',
    manyCases: '{{count}} cases',
    noSummary: 'No summary available.',
    handled: 'Done',
    handledCase: 'Mark “{{subject}}” as done',
    handledError: 'Could not be marked as done.',
    open: 'Open',
    openCase: 'Open “{{subject}}”',
    empty: 'Nothing left to do here.',
  },
};

function aCase(overrides: Partial<Case> = {}): Case {
  return {
    id: '1',
    sender: 'news@example.com',
    recipient: 'info@example.com',
    subject: 'Weekly digest',
    receivedAt: new Date('2026-08-19T08:30:00Z'),
    hasAttachments: false,
    sizeBytes: 2048,
    summary: 'Branch news of the week, nothing urgent.',
    categoryId: 'news',
    categoryName: 'Newsletter',
    categoryColor: 'teal',
    tier: 'info',
    confidence: 0.9,
    handledAt: null,
    deletedAt: null,
    ...overrides,
  };
}

describe('CaseReviewPage', () => {
  const cases = signal<Case[]>([]);
  const error = signal<Error | undefined>(undefined);
  let handled: { id: string; handled: boolean }[];
  let handlingFails: boolean;
  let toasts: ToastMessageOptions[];

  const casesServiceStub = {
    cases: { value: cases, error },
    markHandled: (id: string, isHandled: boolean) => {
      handled.push({ id, handled: isHandled });
      if (handlingFails) {
        return Promise.reject(new Error('nope'));
      }
      cases.update((current) => current.map((row) => (row.id === id ? { ...row, handledAt: new Date() } : row)));
      return Promise.resolve();
    },
  } as unknown as CasesService;

  beforeEach(async () => {
    cases.set([]);
    error.set(undefined);
    handled = [];
    handlingFails = false;
    toasts = [];

    await TestBed.configureTestingModule({
      imports: [
        CaseReviewPage,
        TranslocoTestingModule.forRoot({
          langs: { en: translations },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: CasesService, useValue: casesServiceStub },
        { provide: MessageService, useValue: { add: (toast: ToastMessageOptions) => toasts.push(toast) } },
      ],
    }).compileComponents();
  });

  function createFixture(category = 'Newsletter', tier = 'info'): ComponentFixture<CaseReviewPage> {
    const fixture = TestBed.createComponent(CaseReviewPage);
    fixture.componentRef.setInput('category', category);
    fixture.componentRef.setInput('tier', tier);
    fixture.detectChanges();
    return fixture;
  }

  function button(element: HTMLElement, name: string): HTMLButtonElement {
    const found = Array.from(element.querySelectorAll('button')).find((candidate) => candidate.getAttribute('aria-label') === name);
    expect(found, `button "${name}"`).toBeDefined();
    return found!;
  }

  it('shows one card per mail of the group, with its summary', () => {
    cases.set([
      aCase({ id: '1', subject: 'Weekly digest' }),
      aCase({ id: '2', subject: 'Job offer', summary: null }),
      // Another group, and one the reader is not in.
      aCase({ id: '3', subject: 'Sale', categoryId: 'ads', categoryName: 'Ads', tier: 'ignore' }),
    ]);

    const element = createFixture().nativeElement as HTMLElement;

    const cards = element.querySelectorAll('li');
    expect(cards).toHaveLength(2);
    expect(cards[0].textContent).toContain('Weekly digest');
    expect(cards[0].textContent).toContain('Branch news of the week, nothing urgent.');
    expect(cards[1].textContent).toContain('No summary available.');
    expect(element.textContent).not.toContain('Sale');
    expect(element.querySelector('h1')?.textContent?.trim()).toBe('Newsletter');
    expect(element.textContent).toContain('2 cases');
  });

  it('names the group the triage has not seen, and counts a single case as one', () => {
    cases.set([aCase({ id: '1', categoryId: null, categoryName: null, categoryColor: null, tier: null })]);

    const element = createFixture('', '').nativeElement as HTMLElement;

    expect(element.querySelector('h1')?.textContent?.trim()).toBe('Without a category');
    expect(element.textContent).toContain('1 case');
  });

  it('takes note of a case, which drops it out of the group without a question', async () => {
    cases.set([aCase({ id: '1', subject: 'Weekly digest' }), aCase({ id: '2', subject: 'Job offer' })]);
    const fixture = createFixture();
    const element = fixture.nativeElement as HTMLElement;

    button(element, 'Mark “Weekly digest” as done').click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(handled).toEqual([{ id: '1', handled: true }]);
    // The card disappearing is the answer; a toast per mail would make skimming unbearable.
    expect(toasts).toEqual([]);
    expect(element.querySelectorAll('li')).toHaveLength(1);
    expect(element.textContent).not.toContain('Weekly digest');
  });

  it('says so when taking note could not be saved', async () => {
    cases.set([aCase({ id: '1' })]);
    handlingFails = true;
    const fixture = createFixture();

    button(fixture.nativeElement as HTMLElement, 'Mark “Weekly digest” as done').click();
    await fixture.whenStable();

    expect(toasts.map((toast) => [toast.severity, toast.summary])).toEqual([['error', 'Could not be marked as done.']]);
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('li')).toHaveLength(1);
  });

  it('opens a case, and hands the group over as what the detail view pages through', async () => {
    cases.set([aCase({ id: '1', subject: 'Weekly digest' }), aCase({ id: '2', subject: 'Job offer' })]);
    const fixture = createFixture();
    const router = TestBed.inject(Router);
    const navigated: unknown[][] = [];
    router.navigate = (commands: unknown[]) => {
      navigated.push(commands);
      return Promise.resolve(true);
    };

    button(fixture.nativeElement as HTMLElement, 'Open “Job offer”').click();

    expect(navigated).toEqual([['/cases', '2']]);
    // "The next one" over there means the next one of this group, not of the table behind it.
    expect(TestBed.inject(CaseOrderStore).neighboursOf('1')).toEqual({ previous: null, next: '2', position: 1, total: 2 });
  });

  it('says there is nothing left once every case was taken note of', () => {
    cases.set([aCase({ id: '1', handledAt: new Date('2026-08-20T09:00:00Z') })]);

    const element = createFixture().nativeElement as HTMLElement;

    expect(element.textContent).toContain('Nothing left to do here.');
    expect(element.querySelectorAll('li')).toHaveLength(0);
    // The way back stands there whatever is left.
    expect(element.querySelector('a')?.textContent).toContain('Back to the review');
  });

  it('says the same when the list could not be loaded at all', () => {
    error.set(new Error('offline'));

    const element = createFixture().nativeElement as HTMLElement;

    expect(element.textContent).toContain('Nothing left to do here.');
  });
});
