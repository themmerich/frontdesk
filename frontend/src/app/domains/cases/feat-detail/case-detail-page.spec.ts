import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Confirmation, ConfirmationService, MessageService, ToastMessageOptions } from 'primeng/api';

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
    confidence: 'Model confidence',
    tier: 'Tier',
    original: 'Original message',
    unknownRecipient: 'Recipient unknown',
    attachmentsNotStored: 'Attachments are not stored yet.',
    delete: 'Delete',
    tierChanged: 'Tier changed.',
    tierError: 'The tier could not be changed.',
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
  categoryName: 'Rechnung',
  categoryColor: 'amber',
  tier: 'draft',
  confidence: 0.72,
};

describe('CaseDetailPage', () => {
  const detail = signal<CaseDetail | undefined>(aCase);
  const detailError = signal<Error | undefined>(undefined);
  let changedTiers: string[];
  let removed: string[][];
  const detailServiceStub = {
    id: signal<string | null>(null),
    detail: {
      value: detail,
      error: detailError,
      isLoading: signal(false),
      hasValue: () => detail() !== undefined,
    },
    changeTier: (tier: string) => {
      changedTiers.push(tier);
      return Promise.resolve();
    },
  } as unknown as CaseDetailService;
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
    changedTiers = [];
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

  it('lets a person overrule the tier', async () => {
    const fixture = createFixture();

    await fixture.componentInstance['onChangeTier']('manual');

    expect(changedTiers).toEqual(['manual']);
    expect(toasts[0].summary).toBe('Tier changed.');
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
