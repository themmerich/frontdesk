import { computed, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Confirmation, ConfirmationService, MessageService, ToastMessageOptions } from 'primeng/api';

import { CaseCategoriesService } from '../data/case-categories-service';
import { CasesService } from '../data/cases-service';
import { Case } from '../model/case';
import { CasesPage } from './cases-page';

const translations = {
  cases: {
    classificationSaved: 'Classification saved.',
    classificationError: 'The classification could not be saved.',
    title: 'Cases',
    archiveTitle: 'Archive',
    reopen: 'Reopen',
    reopenRow: 'Reopen {{subject}}',
    reopened: 'The case is back in the inbox.',
    reopenError: 'The case could not be reopened.',
    emptyArchive: 'Nothing done yet',
    review: 'Review',
    reviewTitle: 'Review',
    sender: 'From',
    recipient: 'To',
    subject: 'Subject',
    receivedAt: 'Received',
    empty: 'No cases yet',
    loadError: 'Could not load cases.',
    deleteHeader: 'Confirm deletion',
    deleteOne: 'Really delete {{subject}}?',
    deleteMany: 'Really delete these {{count}} cases?',
    deleteConfirm: 'Delete',
    deleteCancel: 'Cancel',
    deletedOne: 'Case deleted.',
    deletedMany: '{{count}} cases deleted.',
    deleteError: 'Deleting failed.',
  },
};

describe('CasesPage', () => {
  const cases = signal<Case[]>([]);
  const error = signal<Error | undefined>(undefined);
  let removed: string[][];
  let removeFails: boolean;
  let classified: { id: string; categoryId: string | null; tier: string | null }[];
  let failClassification: boolean;
  let reopened: { id: string; handled: boolean }[];
  let failReopen: boolean;
  const casesServiceStub = {
    cases: { value: cases, error },
    // Split the way the service splits them: the inbox shows the open ones, the archive the rest.
    openCases: computed(() => cases().filter((row) => row.handledAt === null)),
    archivedCases: computed(() => cases().filter((row) => row.handledAt !== null)),
    remove: (ids: string[]) => {
      removed.push(ids);
      return removeFails ? Promise.reject(new Error('nope')) : Promise.resolve();
    },
    markHandled: (id: string, handled: boolean) => {
      reopened.push({ id, handled });
      return failReopen ? Promise.reject(new Error('nope')) : Promise.resolve();
    },
    changeClassification: (id: string, categoryId: string | null, tier: string | null) => {
      classified.push({ id, categoryId, tier });
      return failClassification ? Promise.reject(new Error('nope')) : Promise.resolve();
    },
  } as unknown as CasesService;
  const categoriesServiceStub = {
    categories: { value: signal([]), error: signal(undefined) },
  } as unknown as CaseCategoriesService;

  let toasts: ToastMessageOptions[];
  let confirmations: Confirmation[];

  beforeEach(async () => {
    cases.set([]);
    error.set(undefined);
    removed = [];
    removeFails = false;
    classified = [];
    failClassification = false;
    reopened = [];
    failReopen = false;
    toasts = [];
    confirmations = [];
    await TestBed.configureTestingModule({
      imports: [
        CasesPage,
        TranslocoTestingModule.forRoot({
          langs: { en: translations },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
      providers: [
        provideZonelessChangeDetection(),
        // The subject cell links to the case detail.
        provideRouter([]),
        { provide: CasesService, useValue: casesServiceStub },
        { provide: CaseCategoriesService, useValue: categoriesServiceStub },
        // Both outlets live in the shell, which is not part of this fixture; the
        // stubs record what the page would have asked and said.
        {
          provide: ConfirmationService,
          useValue: { confirm: (confirmation: Confirmation) => confirmations.push(confirmation) },
        },
        { provide: MessageService, useValue: { add: (toast: ToastMessageOptions) => toasts.push(toast) } },
      ],
    }).compileComponents();
  });

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

  /** What the toolbar offers, by the words on its buttons. */
  function labels(element: HTMLElement): (string | undefined)[] {
    return Array.from(element.querySelectorAll('p-button')).map((button) => button.textContent?.trim());
  }

  it('shows the title and the cases from the store', () => {
    cases.set([aCase()]);
    const fixture = TestBed.createComponent(CasesPage);
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent;
    expect(text).toContain('Cases');
    expect(text).toContain('anna@example.com');
  });

  it('shows in the inbox only what is still open, and in the archive only the rest', () => {
    cases.set([
      aCase({ id: '1', sender: 'anna@example.com' }),
      aCase({ id: '2', sender: 'ben@example.com', handledAt: new Date('2026-08-20T09:00:00Z') }),
    ]);

    const inbox = TestBed.createComponent(CasesPage);
    inbox.detectChanges();
    const inboxText = (inbox.nativeElement as HTMLElement).textContent;
    expect(inboxText).toContain('anna@example.com');
    expect(inboxText).not.toContain('ben@example.com');

    const archive = TestBed.createComponent(CasesPage);
    archive.componentRef.setInput('archived', true);
    archive.detectChanges();
    const archiveText = (archive.nativeElement as HTMLElement).textContent;
    expect(archiveText).toContain('ben@example.com');
    expect(archiveText).not.toContain('anna@example.com');
    // And it says which page it is, for whoever cannot see the sidebar.
    expect(archive.nativeElement.querySelector('h1').textContent).toContain('Archive');
  });

  it('offers the review in the inbox but not in the archive, where nothing is left to review', () => {
    cases.set([aCase({ id: '1' })]);

    const inbox = TestBed.createComponent(CasesPage);
    inbox.detectChanges();
    expect(labels(inbox.nativeElement as HTMLElement)).toContain('Review');

    const archive = TestBed.createComponent(CasesPage);
    archive.componentRef.setInput('archived', true);
    archive.detectChanges();
    expect(labels(archive.nativeElement as HTMLElement)).not.toContain('Review');
  });

  it('lets each page remember its own filters and sorting', () => {
    const inbox = TestBed.createComponent(CasesPage);
    inbox.detectChanges();
    const archive = TestBed.createComponent(CasesPage);
    archive.componentRef.setInput('archived', true);
    archive.detectChanges();

    // Same table, two piles: what was filtered in the archive says nothing about the inbox.
    expect(inbox.componentInstance['viewKey']()).toBe('frontdesk-case-table');
    expect(archive.componentInstance['viewKey']()).toBe('frontdesk-archive-table');
  });

  it('offers the way back only in the archive, and puts the case into the inbox', async () => {
    const archived = aCase({ id: '2', subject: 'Weekly digest', handledAt: new Date('2026-08-20T09:00:00Z') });
    cases.set([aCase({ id: '1' }), archived]);

    const inbox = TestBed.createComponent(CasesPage);
    inbox.detectChanges();
    // Nothing to put back where nothing was ticked off.
    expect((inbox.nativeElement as HTMLElement).querySelector('tbody button[aria-label^="Reopen"]')).toBeNull();

    const archive = TestBed.createComponent(CasesPage);
    archive.componentRef.setInput('archived', true);
    archive.detectChanges();
    const button = (archive.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('tbody button[aria-label^="Reopen"]')!;
    expect(button.getAttribute('aria-label')).toBe('Reopen Weekly digest');

    button.click();
    await archive.whenStable();

    expect(reopened).toEqual([{ id: '2', handled: false }]);
    // The row leaves the page it was clicked on, so it says where it went.
    expect(toasts.map((toast) => [toast.severity, toast.summary])).toEqual([['success', 'The case is back in the inbox.']]);
  });

  it('says so when the case could not be reopened', async () => {
    failReopen = true;
    cases.set([aCase({ id: '2', handledAt: new Date('2026-08-20T09:00:00Z') })]);
    const archive = TestBed.createComponent(CasesPage);
    archive.componentRef.setInput('archived', true);
    archive.detectChanges();

    (archive.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('tbody button[aria-label^="Reopen"]')!.click();
    await archive.whenStable();

    expect(toasts.map((toast) => [toast.severity, toast.summary])).toEqual([['error', 'The case could not be reopened.']]);
  });

  it('saves what was picked in a row, and says so', async () => {
    const fixture = TestBed.createComponent(CasesPage);

    await fixture.componentInstance['onClassificationChanged']({ id: '1', categoryId: 'c2', tier: 'manual' });

    expect(classified).toEqual([{ id: '1', categoryId: 'c2', tier: 'manual' }]);
    expect(toasts.map((toast) => toast.summary)).toEqual(['Classification saved.']);
  });

  it('says so when what was picked cannot be saved', async () => {
    failClassification = true;
    const fixture = TestBed.createComponent(CasesPage);

    await fixture.componentInstance['onClassificationChanged']({ id: '1', categoryId: null, tier: null });

    expect(toasts.map((toast) => toast.severity)).toEqual(['error']);
  });

  it('shows the load error when the API is unreachable', () => {
    error.set(new Error('connection refused'));
    const fixture = TestBed.createComponent(CasesPage);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Could not load cases.');
  });

  it('asks before deleting, and only deletes once the question was answered', async () => {
    const fixture = TestBed.createComponent(CasesPage);
    fixture.detectChanges();

    fixture.componentInstance['onDeleteRequested']([{ id: 'a', subject: 'Weg damit' } as Case, { id: 'b', subject: 'Auch weg' } as Case]);

    // Nothing is gone yet — the dialog is up and the page waits.
    expect(removed).toEqual([]);
    expect(confirmations).toHaveLength(1);
    expect(confirmations[0].message).toBe('Really delete these 2 cases?');

    confirmations[0].accept!();
    await fixture.whenStable();

    expect(removed).toEqual([['a', 'b']]);
    expect(toasts[0].summary).toBe('2 cases deleted.');
  });

  it('names the single case it is about to delete', () => {
    const fixture = TestBed.createComponent(CasesPage);
    fixture.detectChanges();

    fixture.componentInstance['onDeleteRequested']([{ id: 'a', subject: 'Rechnung 2026-081' } as Case]);

    expect(confirmations[0].message).toBe('Really delete Rechnung 2026-081?');
  });

  it('says so when the deletion fails', async () => {
    removeFails = true;
    const fixture = TestBed.createComponent(CasesPage);
    fixture.detectChanges();

    fixture.componentInstance['onDeleteRequested']([{ id: 'a', subject: 'Weg damit' } as Case]);
    confirmations[0].accept!();
    await fixture.whenStable();

    expect(toasts[0].severity).toBe('error');
    expect(toasts[0].summary).toBe('Deleting failed.');
  });

  it('asks nothing when nothing is selected', () => {
    const fixture = TestBed.createComponent(CasesPage);
    fixture.detectChanges();

    fixture.componentInstance['onDeleteRequested']([]);

    expect(confirmations).toEqual([]);
  });
});
