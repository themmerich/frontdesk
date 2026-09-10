import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Confirmation, ConfirmationService, MessageService, ToastMessageOptions } from 'primeng/api';

import { CaseCategoriesService } from '../data/case-categories-service';
import { CaseDetailService } from '../data/case-detail-service';
import { CaseOrderStore } from '../data/case-order-store';
import { CasesService } from '../data/cases-service';
import { CaseDetail } from '../model/case';
import { CaseDetailPage } from './case-detail-page';

/** Only what the draft section and the save button read; everything else renders as its key. */
const translations = {
  cases: { deleteCancel: 'Cancel' },
  caseDetail: {
    draft: 'Reply draft',
    draftNone: 'No draft yet.',
    draftNoneTrashed: 'No draft.',
    generate: 'Write a draft',
    regenerate: 'Write again',
    regenerateHeader: 'Write the draft again?',
    regenerateMessage: 'The edited text will be replaced.',
    draftGeneratedAt: 'Written on {{date}}',
    draftEditedAt: 'Edited on {{date}}',
    draftGenerated: 'Draft written.',
    draftError: 'No draft could be written.',
    save: 'Save',
    saved: 'Changes saved.',
    saveError: 'The changes could not be saved.',
  },
};

const aCase: CaseDetail = {
  id: 'b',
  sender: 'kunde@example.com',
  recipient: 'info@musterfirma.de',
  subject: 'Lieferung 4711',
  bodyText: 'Wann kommt die Lieferung?',
  bodyHtml: null,
  receivedAt: new Date('2026-08-19T08:30:00Z'),
  hasAttachments: false,
  sizeBytes: 2048,
  summary: 'Kunde fragt nach dem Liefertermin.',
  categoryId: 'c1',
  categoryName: 'Statusanfrage',
  categoryColor: 'blue',
  tier: 'draft',
  confidence: 0.9,
  handledAt: null,
  deletedAt: null,
  draftText: null,
  draftGeneratedAt: null,
  draftUpdatedAt: null,
};

/** The case once the model has written to it: both moments the same, nothing edited yet. */
const drafted: CaseDetail = {
  ...aCase,
  draftText: 'Guten Tag,\n\ndie Lieferung ist unterwegs.',
  draftGeneratedAt: new Date('2026-08-19T10:00:00Z'),
  draftUpdatedAt: new Date('2026-08-19T10:00:00Z'),
};

describe('CaseDetailPage reply draft', () => {
  const detail = signal<CaseDetail | undefined>(aCase);
  let classifications: { categoryId: string | null; tier: string | null }[];
  let savedDrafts: string[];
  let generations: number;
  let generationFails: boolean;
  let reloads: number;
  const detailServiceStub = {
    id: signal<string | null>(null),
    detail: {
      value: detail,
      error: signal<Error | undefined>(undefined),
      isLoading: signal(false),
      hasValue: () => detail() !== undefined,
    },
    changeClassification: (categoryId: string | null, tier: string | null) => {
      classifications.push({ categoryId, tier });
      return Promise.resolve();
    },
    generateDraft: () => {
      generations++;
      if (generationFails) {
        return Promise.reject(new Error('nope'));
      }
      detail.set(drafted);
      return Promise.resolve();
    },
    saveDraft: (text: string) => {
      savedDrafts.push(text);
      detail.set({ ...detail()!, draftText: text, draftUpdatedAt: new Date('2026-08-19T10:05:00Z') });
      return Promise.resolve();
    },
  } as unknown as CaseDetailService;
  const categoriesServiceStub = {
    categories: { value: signal([{ id: 'c1', name: 'Statusanfrage', color: 'blue' as const }]), error: signal(undefined) },
  } as unknown as CaseCategoriesService;
  const casesServiceStub = {
    cases: { reload: () => reloads++ },
  } as unknown as CasesService;

  let toasts: ToastMessageOptions[];
  let confirmations: Confirmation[];

  beforeEach(async () => {
    detail.set(aCase);
    classifications = [];
    savedDrafts = [];
    generations = 0;
    generationFails = false;
    reloads = 0;
    toasts = [];
    confirmations = [];
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
        CaseOrderStore,
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
  });

  function createFixture() {
    const fixture = TestBed.createComponent(CaseDetailPage);
    fixture.componentRef.setInput('id', 'b');
    fixture.detectChanges();
    return fixture;
  }

  function button(fixture: ComponentFixture<CaseDetailPage>, label: string): HTMLButtonElement | undefined {
    return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button')).find(
      (candidate) => candidate.textContent?.trim() === label,
    );
  }

  function textarea(fixture: ComponentFixture<CaseDetailPage>): HTMLTextAreaElement | null {
    return (fixture.nativeElement as HTMLElement).querySelector('textarea#draft');
  }

  it('says that there is no draft yet, and writes one at the press of the button', async () => {
    const fixture = createFixture();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No draft yet.');
    expect(textarea(fixture)).toBeNull();

    button(fixture, 'Write a draft')!.click();
    await fixture.whenStable();

    expect(generations).toBe(1);
    expect(textarea(fixture)!.value).toBe('Guten Tag,\n\ndie Lieferung ist unterwegs.');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Written on');
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Edited on');
    // The inbox says which cases have a reply waiting, one page back.
    expect(reloads).toBe(1);
    expect(toasts.map((toast) => toast.summary)).toEqual(['Draft written.']);
  });

  it('says so when the model gave no draft, and leaves the page as it was', async () => {
    generationFails = true;
    const fixture = createFixture();

    button(fixture, 'Write a draft')!.click();
    await fixture.whenStable();

    expect(textarea(fixture)).toBeNull();
    expect(toasts.map((toast) => toast.summary)).toEqual(['No draft could be written.']);
  });

  it('saves an edited draft from the one save button, together with the verdict', async () => {
    detail.set(drafted);
    const fixture = createFixture();
    const page = fixture.componentInstance;
    expect(page['isDirty']()).toBe(false);

    page['draftText'].set('Guten Tag,\n\ndie Lieferung kommt morgen.');
    page['draftTier'].set('manual');
    await fixture.whenStable();
    expect(page['isDirty']()).toBe(true);

    await page['onSave']();

    expect(classifications).toEqual([{ categoryId: 'c1', tier: 'manual' }]);
    expect(savedDrafts).toEqual(['Guten Tag,\n\ndie Lieferung kommt morgen.']);
    expect(toasts.map((toast) => toast.summary)).toEqual(['Changes saved.']);
    expect(page['isDirty']()).toBe(false);
    await fixture.whenStable();
    // The edit is dated once it is saved.
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Edited on');
  });

  it('saves only what changed: the draft alone leaves the verdict alone', async () => {
    detail.set(drafted);
    const fixture = createFixture();
    const page = fixture.componentInstance;

    page['draftText'].set('Anders.');
    await page['onSave']();

    expect(classifications).toEqual([]);
    expect(savedDrafts).toEqual(['Anders.']);
  });

  it('starts from the draft of the next case, not from the edit left on the last one', async () => {
    detail.set(drafted);
    const fixture = createFixture();
    const page = fixture.componentInstance;
    page['draftText'].set('Halb fertig.');
    await fixture.whenStable();

    detail.set({ ...drafted, id: 'c', draftText: 'Der nächste Entwurf.' });
    await fixture.whenStable();

    expect(page['draftText']()).toBe('Der nächste Entwurf.');
    expect(page['isDirty']()).toBe(false);
  });

  it('writes again without asking while nothing of a person is in the draft', async () => {
    detail.set(drafted);
    const fixture = createFixture();

    button(fixture, 'Write again')!.click();
    await fixture.whenStable();

    expect(confirmations).toEqual([]);
    expect(generations).toBe(1);
  });

  it('asks before writing over an edit, whether saved or not', async () => {
    detail.set(drafted);
    const fixture = createFixture();
    const page = fixture.componentInstance;

    // Typed and not saved.
    page['draftText'].set('Eigene Worte.');
    await fixture.whenStable();
    button(fixture, 'Write again')!.click();
    expect(confirmations).toHaveLength(1);
    expect(generations).toBe(0);

    // Saved, and edited since the model wrote it.
    page['draftText'].set(drafted.draftText);
    detail.set({ ...drafted, draftUpdatedAt: new Date('2026-08-19T11:00:00Z') });
    await fixture.whenStable();
    button(fixture, 'Write again')!.click();
    expect(confirmations).toHaveLength(2);

    confirmations[1].accept!();
    await fixture.whenStable();
    expect(generations).toBe(1);
  });

  it('shows a draft in the trash as it is, and offers nothing to do with it', () => {
    detail.set({ ...drafted, deletedAt: new Date('2026-08-20T08:00:00Z') });
    const fixture = createFixture();

    expect(textarea(fixture)!.readOnly).toBe(true);
    expect(button(fixture, 'Write again')).toBeUndefined();
  });

  it('offers no way to write a draft for a case in the trash', () => {
    detail.set({ ...aCase, deletedAt: new Date('2026-08-20T08:00:00Z') });
    const fixture = createFixture();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No draft.');
    expect(button(fixture, 'Write a draft')).toBeUndefined();
  });
});
