import { BreakpointObserver } from '@angular/cdk/layout';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Confirmation, ConfirmationService, MessageService, ToastMessageOptions } from 'primeng/api';
import { of } from 'rxjs';

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
    markHandled: 'Done',
    markedHandled: 'Case moved to the archive.',
    markHandledError: 'The case could not be moved to the archive.',
    reopen: 'Reopen',
    reopened: 'The case is back in the inbox.',
    reopenError: 'The case could not be reopened.',
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
    send: 'Send',
    confidence: 'Model confidence',
    tier: 'Tier',
    original: 'Original message',
    htmlMail: 'Message',
    remoteBlocked: 'Pictures from the internet were not loaded.',
    showRemote: 'Show pictures',
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
  bodyHtml: null,
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
  draftText: null,
  draftGeneratedAt: null,
  draftUpdatedAt: null,
  attachments: [],
  sentAt: null,
  sentByName: null,
  events: [],
};

describe('CaseDetailPage', () => {
  const detail = signal<CaseDetail | undefined>(aCase);
  const detailError = signal<Error | undefined>(undefined);
  let saved: { categoryId: string | null; tier: string | null }[];
  let removed: string[][];
  let handled: { id: string; handled: boolean }[];
  let saveFails: boolean;
  let handlingFails: boolean;
  const detailServiceStub = {
    id: signal<string | null>(null),
    detail: {
      value: detail,
      error: detailError,
      isLoading: signal(false),
      hasValue: () => detail() !== undefined,
    },
    inlineImages: { value: signal(undefined) },
    attachmentUrl: (attachmentId: string) => `/api/cases/b/attachments/${attachmentId}`,
    changeClassification: (categoryId: string | null, tier: string | null) => {
      saved.push({ categoryId, tier });
      return saveFails ? Promise.reject(new Error('nope')) : Promise.resolve();
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
    markHandled: (id: string, isHandled: boolean) => {
      handled.push({ id, handled: isHandled });
      return handlingFails ? Promise.reject(new Error('nope')) : Promise.resolve();
    },
  } as unknown as CasesService;

  let toasts: ToastMessageOptions[];
  let confirmations: Confirmation[];
  let navigated: unknown[][];
  /** What the screen is like; read when the page is created, so a test sets it before that. */
  let isWide: boolean;
  const breakpointsStub = {
    observe: () => of({ matches: isWide, breakpoints: {} }),
    isMatched: () => isWide,
  } as unknown as BreakpointObserver;

  beforeEach(async () => {
    detail.set(aCase);
    detailError.set(undefined);
    saved = [];
    categoriesError.set(undefined);
    removed = [];
    handled = [];
    saveFails = false;
    handlingFails = false;
    toasts = [];
    confirmations = [];
    navigated = [];
    isWide = false;
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
        { provide: BreakpointObserver, useValue: breakpointsStub },
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

  /** A footer button by the word on it. */
  function button(fixture: ComponentFixture<CaseDetailPage>, label: string): HTMLButtonElement {
    const found = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).find(
      (candidate) => candidate.textContent?.trim() === label,
    );
    expect(found, `button "${label}"`).toBeDefined();
    return found!;
  }

  function createFixture() {
    const fixture = TestBed.createComponent(CaseDetailPage);
    fixture.componentRef.setInput('id', 'b');
    fixture.detectChanges();
    return fixture;
  }

  it('puts the mail and the reply beside each other on a wide screen, and remembers that split on its own', () => {
    isWide = true;
    const element = createFixture().nativeElement as HTMLElement;

    const splitter = element.querySelector('p-splitter')!;
    expect(splitter.getAttribute('data-orientation')).toBe('horizontal');
    expect(element.querySelector('[role="separator"]')?.getAttribute('aria-orientation')).toBe('horizontal');
    expect(createFixture().componentInstance['splitterStateKey']()).toBe('frontdesk-case-detail-splitter-wide');
  });

  it('puts the reply under the mail on a narrow screen, with a split of its own', () => {
    const fixture = createFixture();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('p-splitter')!.getAttribute('data-orientation')).toBe('vertical');
    expect(fixture.componentInstance['splitterStateKey']()).toBe('frontdesk-case-detail-splitter-stacked');
  });

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

  it('shows a mail written in HTML in a frame that may do nothing', () => {
    detail.set({ ...aCase, bodyHtml: '<p>Hallo <b>Welt</b></p>' });

    const element = createFixture().nativeElement as HTMLElement;

    const frame = element.querySelector('iframe')!;
    expect(frame.getAttribute('sandbox')).toBe('allow-popups allow-popups-to-escape-sandbox');
    expect(frame.getAttribute('referrerpolicy')).toBe('no-referrer');
    // The mail itself, untouched, inside a document that says what it may do.
    expect(frame.getAttribute('srcdoc')).toContain('<p>Hallo <b>Welt</b></p>');
    expect(frame.getAttribute('srcdoc')).toContain("default-src 'none'");
    // And the plain text box is not there beside it.
    expect(element.querySelector('.whitespace-pre-wrap')).toBeNull();
  });

  it('reads a mail without an HTML part as text, as before', () => {
    detail.set({ ...aCase, bodyHtml: null, bodyText: 'Bitte um eine Kopie.' });

    const element = createFixture().nativeElement as HTMLElement;

    expect(element.querySelector('iframe')).toBeNull();
    expect(element.textContent).toContain('Bitte um eine Kopie.');
  });

  it('holds the pictures of a mail back until they are asked for, and asks again for the next mail', async () => {
    detail.set({ ...aCase, bodyHtml: '<img src="https://tracker.example.com/pixel.gif">' });
    const fixture = createFixture();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.textContent).toContain('Pictures from the internet were not loaded.');
    expect(element.querySelector('iframe')!.getAttribute('srcdoc')).toContain('img-src data:');

    Array.from(element.querySelectorAll('button'))
      .find((candidate) => candidate.textContent?.includes('Show pictures'))!
      .click();
    fixture.detectChanges();

    expect(element.querySelector('iframe')!.getAttribute('srcdoc')).toContain('img-src data: https:');
    expect(element.textContent).not.toContain('Pictures from the internet were not loaded.');

    // The next mail asks again: a yes was about that one mail.
    detail.set({ ...aCase, id: '2', bodyHtml: '<img src="https://tracker.example.com/other.gif">' });
    fixture.detectChanges();

    expect(element.textContent).toContain('Pictures from the internet were not loaded.');
  });

  it('says nothing about pictures for a mail that carries everything it shows', () => {
    detail.set({ ...aCase, bodyHtml: '<p>Hallo</p>' });

    const element = createFixture().nativeElement as HTMLElement;

    expect(element.textContent).not.toContain('Pictures from the internet were not loaded.');
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

  it('ticks a case off and moves on to the next one, as after deleting', async () => {
    TestBed.inject(CaseOrderStore).set(['a', 'b', 'c']);
    const fixture = createFixture();

    button(fixture, 'Done').click();
    await fixture.whenStable();

    expect(handled).toEqual([{ id: 'b', handled: true }]);
    expect(toasts.map((toast) => [toast.severity, toast.summary])).toEqual([['success', 'Case moved to the archive.']]);
    // The case has left the list that was being worked through; staying on it would be a page
    // nobody came for.
    expect(navigated).toEqual([['/cases', 'c']]);
  });

  it('goes back to the inbox when the case it ticks off was the last one', async () => {
    const fixture = createFixture();

    button(fixture, 'Done').click();
    await fixture.whenStable();

    expect(navigated).toEqual([['/']]);
  });

  it('saves what was picked before it ticks the case off', async () => {
    const fixture = createFixture();
    fixture.componentInstance['draftCategoryId'].set('c2');
    fixture.detectChanges();

    button(fixture, 'Done').click();
    await fixture.whenStable();

    // "Erledigt" says the case is settled, so the correction goes with it rather than being lost.
    expect(saved).toEqual([{ categoryId: 'c2', tier: 'draft' }]);
    expect(handled).toEqual([{ id: 'b', handled: true }]);
  });

  it('stops where saving stops, and leaves the case where it is', async () => {
    saveFails = true;
    const fixture = createFixture();
    fixture.componentInstance['draftCategoryId'].set('c2');
    fixture.detectChanges();

    button(fixture, 'Done').click();
    await fixture.whenStable();

    expect(handled).toEqual([]);
    expect(navigated).toEqual([]);
    expect(toasts.map((toast) => toast.summary)).toEqual(['The classification could not be saved.']);
  });

  it('says so when the case could not be moved to the archive', async () => {
    handlingFails = true;
    const fixture = createFixture();

    button(fixture, 'Done').click();
    await fixture.whenStable();

    expect(toasts.map((toast) => [toast.severity, toast.summary])).toEqual([['error', 'The case could not be moved to the archive.']]);
    expect(navigated).toEqual([]);
  });

  it('offers the way back for a case that was ticked off already', async () => {
    detail.set({ ...aCase, handledAt: new Date('2026-08-20T09:00:00Z') });
    const fixture = createFixture();

    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Done');
    button(fixture, 'Reopen').click();
    await fixture.whenStable();

    expect(handled).toEqual([{ id: 'b', handled: false }]);
    expect(toasts.map((toast) => toast.summary)).toEqual(['The case is back in the inbox.']);
  });

  it('offers neither for a case in the trash, which is put back or deleted there', () => {
    detail.set({ ...aCase, deletedAt: new Date('2026-08-21T09:00:00Z') });

    const text = (createFixture().nativeElement as HTMLElement).textContent;

    expect(text).not.toContain('Done');
    expect(text).not.toContain('Reopen');
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
