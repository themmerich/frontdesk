import { BreakpointObserver } from '@angular/cdk/layout';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Confirmation, ConfirmationService, MessageService, ToastMessageOptions } from 'primeng/api';
import { of } from 'rxjs';

import { CaseCategoriesService } from '../data/case-categories-service';
import { CaseDetailService } from '../data/case-detail-service';
import { CaseOrderStore } from '../data/case-order-store';
import { CasesService } from '../data/cases-service';
import { CaseDetail } from '../model/case';
import { CaseDetailPage } from './case-detail-page';

/** Only what sending reads; everything else renders as its key. */
const translations = {
  cases: { deleteCancel: 'Cancel' },
  caseDetail: {
    draft: 'Reply draft',
    generate: 'Write a draft',
    regenerate: 'Write again',
    save: 'Save',
    saved: 'Changes saved.',
    saveError: 'The changes could not be saved.',
    send: 'Send',
    sendHeader: 'Send the reply?',
    sendMessage: 'The reply goes to {{to}}. Subject: {{subject}}',
    sent: 'Reply sent.',
    sendError: 'The reply could not be sent.',
    sentAt: 'Sent on {{date}} by {{name}}',
    history: 'History',
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
  summary: null,
  categoryId: 'c1',
  categoryName: 'Statusanfrage',
  categoryColor: 'blue',
  tier: 'draft',
  confidence: 0.9,
  handledAt: null,
  deletedAt: null,
  draftText: 'Guten Tag,\n\ndie Lieferung ist unterwegs.',
  draftGeneratedAt: new Date('2026-08-19T10:00:00Z'),
  draftUpdatedAt: new Date('2026-08-19T10:00:00Z'),
  attachments: [],
  sentAt: null,
  sentByName: null,
  events: [],
};

/** The case once the reply went out: frozen, in the archive, with the step on its trail. */
const sentCase: CaseDetail = {
  ...aCase,
  sentAt: new Date('2026-08-19T11:00:00Z'),
  sentByName: 'Anna Muster',
  handledAt: new Date('2026-08-19T11:00:00Z'),
  events: [{ type: 'sent', occurredAt: new Date('2026-08-19T11:00:00Z'), actorName: 'Anna Muster', details: { to: 'kunde@example.com' } }],
};

describe('CaseDetailPage sending', () => {
  const detail = signal<CaseDetail | undefined>(aCase);
  let sends: number;
  let sendFails: boolean;
  let savedDrafts: string[];
  let reloads: number;
  const detailServiceStub = {
    id: signal<string | null>('b'),
    detail: {
      value: detail,
      error: signal<Error | undefined>(undefined),
      isLoading: signal(false),
      hasValue: () => detail() !== undefined,
    },
    inlineImages: { value: signal(undefined) },
    attachmentUrl: (attachmentId: string) => `/api/cases/b/attachments/${attachmentId}`,
    changeClassification: () => Promise.resolve(),
    saveDraft: (text: string) => {
      savedDrafts.push(text);
      detail.set({ ...detail()!, draftText: text, draftUpdatedAt: new Date('2026-08-19T10:05:00Z') });
      return Promise.resolve();
    },
    send: () => {
      sends++;
      if (sendFails) {
        return Promise.reject(new Error('nope'));
      }
      detail.set({ ...sentCase, draftText: detail()!.draftText });
      return Promise.resolve();
    },
  } as unknown as CaseDetailService;
  const categoriesServiceStub = {
    categories: { value: signal([{ id: 'c1', name: 'Statusanfrage', color: 'blue' as const }]), error: signal(undefined) },
  } as unknown as CaseCategoriesService;
  const casesServiceStub = {
    cases: { reload: () => reloads++ },
  } as unknown as CasesService;
  const breakpointsStub = {
    observe: () => of({ matches: false, breakpoints: {} }),
    isMatched: () => false,
  } as unknown as BreakpointObserver;

  let toasts: ToastMessageOptions[];
  let confirmations: Confirmation[];

  beforeEach(async () => {
    detail.set(aCase);
    sends = 0;
    sendFails = false;
    savedDrafts = [];
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
        { provide: BreakpointObserver, useValue: breakpointsStub },
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

  function textarea(fixture: ComponentFixture<CaseDetailPage>): HTMLTextAreaElement {
    return (fixture.nativeElement as HTMLElement).querySelector('textarea#draft')!;
  }

  it('asks before the reply leaves, naming who gets it, and sends on yes', async () => {
    const fixture = createFixture();

    button(fixture, 'Send')!.click();
    await fixture.whenStable();

    // Nothing has left yet: the question comes first, with the address and the subject.
    expect(sends).toBe(0);
    expect(confirmations).toHaveLength(1);
    expect(confirmations[0].header).toBe('Send the reply?');
    expect(confirmations[0].message).toBe('The reply goes to kunde@example.com. Subject: Lieferung 4711');

    confirmations[0].accept!();
    await fixture.whenStable();

    expect(sends).toBe(1);
    expect(toasts.map((toast) => [toast.severity, toast.summary])).toEqual([['success', 'Reply sent.']]);
    // The inbox has one case less; the page stays on the case as it now stands.
    expect(reloads).toBe(1);
    const element = fixture.nativeElement as HTMLElement;
    expect(textarea(fixture).readOnly).toBe(true);
    expect(element.textContent).toContain('Sent on');
    expect(element.textContent).toContain('by Anna Muster');
    // Nothing more to write or to send: the line for the model and the button are gone.
    expect(element.querySelector('#draft-instruction')).toBeNull();
    expect(button(fixture, 'Write again')).toBeUndefined();
    expect(button(fixture, 'Send')).toBeUndefined();
  });

  it('saves what a person typed into the box before it goes out', async () => {
    const fixture = createFixture();
    fixture.componentInstance['draftText'].set('Guten Tag,\n\ndie Lieferung kommt morgen.');
    await fixture.whenStable();

    button(fixture, 'Send')!.click();
    confirmations[0].accept!();
    await fixture.whenStable();

    // The edit first, then the send: what the customer gets is what stands in the box.
    expect(savedDrafts).toEqual(['Guten Tag,\n\ndie Lieferung kommt morgen.']);
    expect(sends).toBe(1);
  });

  it('offers no send button without a reply, in the trash, or once the reply went out', () => {
    detail.set({ ...aCase, draftText: null });
    expect(button(createFixture(), 'Send')!.disabled).toBe(true);

    detail.set({ ...aCase, deletedAt: new Date('2026-08-20T08:00:00Z') });
    expect(button(createFixture(), 'Send')).toBeUndefined();

    detail.set(sentCase);
    expect(button(createFixture(), 'Send')).toBeUndefined();
  });

  it('says so when the reply could not be sent, and leaves the case as it was', async () => {
    sendFails = true;
    const fixture = createFixture();

    button(fixture, 'Send')!.click();
    confirmations[0].accept!();
    await fixture.whenStable();

    expect(toasts.map((toast) => [toast.severity, toast.summary])).toEqual([['error', 'The reply could not be sent.']]);
    expect(textarea(fixture).readOnly).toBe(false);
    expect(button(fixture, 'Send')).toBeDefined();
  });

  it('shows the trail beside the verdict', () => {
    detail.set(sentCase);
    const element = createFixture().nativeElement as HTMLElement;

    expect(element.textContent).toContain('History');
    expect(element.querySelector('app-case-timeline [data-event="sent"]')).not.toBeNull();
  });
});
