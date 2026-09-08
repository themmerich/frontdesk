import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Confirmation, ConfirmationService, MessageService, ToastMessageOptions } from 'primeng/api';

import { CaseCategoriesService } from '../data/case-categories-service';
import { CaseDetailService } from '../data/case-detail-service';
import { CaseOrderStore } from '../data/case-order-store';
import { CasesService } from '../data/cases-service';
import { CaseDetail } from '../model/case';
import { CaseDetailPage } from './case-detail-page';

const translations = {
  cases: {
    tierAutomatic: 'Automatic',
    tierDraft: 'Draft',
    tierManual: 'Manual',
    tierInfo: 'Info',
    tierIgnore: 'Ignore',
    deleteHeader: 'Confirm deletion',
    deleteOne: 'Really delete {{subject}}?',
    deleteConfirm: 'Delete',
    deleteCancel: 'Cancel',
    deletedOne: 'Case deleted.',
    deleteError: 'Deleting failed.',
  },
  caseDetail: {
    backToInbox: 'Inbox',
    position: 'Case {{position}} of {{total}}',
    previous: 'Previous case',
    next: 'Next case',
    verdict: 'Assessment',
    category: 'Category',
    noCategory: 'Without a category',
    saved: 'Classification saved.',
    saveError: 'The classification could not be saved.',
    confidence: 'Model confidence',
    tier: 'Tier',
    original: 'Original message',
    unknownRecipient: 'Recipient unknown',
    attachmentsNotStored: 'Attachments are not stored yet.',
    delete: 'Delete',
    loadError: 'Could not load the case.',
    loading: 'Loading',
  },
};

const aCase: CaseDetail = {
  id: 'b',
  sender: 'kunde@example.com',
  recipient: 'rechnung@musterfirma.de',
  subject: 'Rechnung 2026-081',
  bodyText: 'Bitte um eine Kopie.',
  receivedAt: new Date('2026-08-19T08:30:00Z'),
  hasAttachments: true,
  sizeBytes: 2048,
  summary: 'Kunde bittet um eine Kopie.',
  categoryId: 'c1',
  categoryName: 'Rechnung',
  categoryColor: 'amber',
  tier: 'draft',
  confidence: 0.72,
  handledAt: null,
  deletedAt: null,
};

describe('CaseDetailPage', () => {
  const detail = signal<CaseDetail | undefined>(aCase);
  const detailError = signal<Error | undefined>(undefined);
  let saved: { categoryId: string | null; tier: string }[];
  let removed: string[][];
  const detailServiceStub = {
    id: signal<string | null>(null),
    detail: {
      value: detail,
      error: detailError,
      isLoading: signal(false),
      hasValue: () => detail() !== undefined,
    },
    changeClassification: (categoryId: string | null, tier: string) => {
      saved.push({ categoryId, tier });
      return Promise.resolve();
    },
  } as unknown as CaseDetailService;
  const categories = signal([
    { id: 'c1', name: 'Statusanfrage Bestellung', color: 'blue' as const },
    { id: 'c2', name: 'Reklamation', color: 'red' as const },
  ]);
  const categoriesError = signal<Error | undefined>(undefined);
  const categoriesServiceStub = {
    categories: { value: categories, error: categoriesError },
  } as unknown as CaseCategoriesService;
  const casesServiceStub = {
    cases: { reload: () => undefined },
    remove: (ids: string[]) => {
      removed.push(ids);
      return Promise.resolve();
    },
  } as unknown as CasesService;

  let toasts: ToastMessageOptions[];
  let confirmations: Confirmation[];
  let navigated: unknown[][];

  beforeEach(async () => {
    detail.set(aCase);
    detailError.set(undefined);
    saved = [];
    categoriesError.set(undefined);
    removed = [];
    toasts = [];
    confirmations = [];
    navigated = [];
    await TestBed.configureTestingModule({
      imports: [
        CaseDetailPage,
        TranslocoTestingModule.forRoot({
          langs: { en: translations },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: CaseDetailService, useValue: detailServiceStub },
        { provide: CaseCategoriesService, useValue: categoriesServiceStub },
        { provide: CasesService, useValue: casesServiceStub },
        {
          provide: ConfirmationService,
          useValue: { confirm: (confirmation: Confirmation) => confirmations.push(confirmation) },
        },
        { provide: MessageService, useValue: { add: (toast: ToastMessageOptions) => toasts.push(toast) } },
      ],
    }).compileComponents();
    TestBed.inject(Router).navigate = (commands: unknown[]) => {
      navigated.push(commands);
      return Promise.resolve(true);
    };
  });

  function createFixture() {
    const fixture = TestBed.createComponent(CaseDetailPage);
    fixture.componentRef.setInput('id', 'b');
    fixture.detectChanges();
    return fixture;
  }

  it('shows the mail, the assessment and that attachments are missing', () => {
    const element = createFixture().nativeElement as HTMLElement;

    expect(element.textContent).toContain('Rechnung 2026-081');
    expect(element.textContent).toContain('Bitte um eine Kopie.');
    expect(element.textContent).toContain('kunde@example.com');
    expect(element.textContent).toContain('rechnung@musterfirma.de');
    expect(element.textContent).toContain('Kunde bittet um eine Kopie.');
    expect(element.textContent).toContain('72%');
    // Named rather than silently absent, because the mail says it has them.
    expect(element.textContent).toContain('Attachments are not stored yet.');
  });

  it('makes the addresses in the mail clickable, and opens them in a new tab', () => {
    detail.set({
      ...aCase,
      bodyText: 'Status unter https://example.com/status/4711 (Sendungsnummer dort).\nMehr auf www.example.com/faq.',
    });

    const element = createFixture().nativeElement as HTMLElement;

    const links = Array.from(element.querySelectorAll('a[target="_blank"]'));
    expect(links.map((link) => link.textContent)).toEqual(['https://example.com/status/4711', 'www.example.com/faq']);
    // An address without a scheme would otherwise read as a path inside this app.
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['https://example.com/status/4711', 'https://www.example.com/faq']);
    // A new tab must not be handed a way back into this one.
    expect(links.every((link) => link.getAttribute('rel') === 'noopener noreferrer')).toBe(true);
    // The rest of the mail stays the text it was, brackets, full stops and line break included.
    expect(element.textContent).toContain('(Sendungsnummer dort).');
  });

  it('saves the category and the tier together, and only when asked to', async () => {
    const fixture = createFixture();
    const page = fixture.componentInstance;

    // Picking writes nothing: the case is corrected from the button below.
    page['draftCategoryId'].set('c2');
    page['draftTier'].set('manual');
    await fixture.whenStable();
    expect(saved).toEqual([]);
    expect(page['isDirty']()).toBe(true);

    await page['onSave']();

    expect(saved).toEqual([{ categoryId: 'c2', tier: 'manual' }]);
    expect(toasts.map((toast) => toast.summary)).toEqual(['Classification saved.']);
  });

  it('has nothing to save until something differs from the case', async () => {
    const fixture = createFixture();
    const page = fixture.componentInstance;
    expect(page['isDirty']()).toBe(false);

    page['draftCategoryId'].set(null);
    await fixture.whenStable();
    expect(page['isDirty']()).toBe(true);

    // Back to what the case says: nothing to save again.
    page['draftCategoryId'].set('c1');
    await fixture.whenStable();
    expect(page['isDirty']()).toBe(false);
  });

  it('starts from what the next case says, not from the edit left on the last one', async () => {
    const fixture = createFixture();
    const page = fixture.componentInstance;
    page['draftTier'].set('ignore');
    await fixture.whenStable();

    // Paging to another case re-reads rather than re-creates the page.
    detail.set({ ...aCase, id: 'c', categoryId: 'c2', tier: 'manual' });
    await fixture.whenStable();

    expect(page['draftTier']()).toBe('manual');
    expect(page['draftCategoryId']()).toBe('c2');
    expect(page['isDirty']()).toBe(false);
  });

  it('keeps a category the case sits in but nobody can pick any more', () => {
    // Retired since the case was filed: dropping it from the list would file the case elsewhere
    // the moment somebody opens it.
    detail.set({ ...aCase, categoryId: 'gone', categoryName: 'Alte Kategorie' });

    const options = createFixture().componentInstance['categoryOptions']() as { label: string; value: string | null }[];

    expect(options.map((option) => option.label)).toEqual([
      'Without a category',
      'Alte Kategorie',
      'Statusanfrage Bestellung',
      'Reklamation',
    ]);
  });

  it('hides the paging when the page was opened without a list behind it', () => {
    const element = createFixture().nativeElement as HTMLElement;

    expect(element.textContent).not.toContain('Case 2 of 3');
  });

  it('pages through the order the list published', async () => {
    TestBed.inject(CaseOrderStore).set(['a', 'b', 'c']);
    const fixture = createFixture();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.textContent).toContain('Case 2 of 3');
    const next = element.querySelector('button[aria-label="Next case"]') as HTMLButtonElement;
    next.click();
    await fixture.whenStable();

    expect(navigated).toEqual([['/cases', 'c']]);
  });

  it('asks before deleting and moves on to the next case', async () => {
    TestBed.inject(CaseOrderStore).set(['a', 'b', 'c']);
    const fixture = createFixture();

    fixture.componentInstance['onDelete'](aCase);
    expect(removed).toEqual([]);
    expect(confirmations[0].message).toBe('Really delete Rechnung 2026-081?');

    confirmations[0].accept!();
    await fixture.whenStable();

    expect(removed).toEqual([['b']]);
    // Tidying up happens in a run; back to the inbox every time loses the thread.
    expect(navigated).toEqual([['/cases', 'c']]);
  });

  it('goes back to the inbox when the deleted case was the only one', async () => {
    const fixture = createFixture();

    fixture.componentInstance['onDelete'](aCase);
    confirmations[0].accept!();
    await fixture.whenStable();

    expect(navigated).toEqual([['/']]);
  });
});
