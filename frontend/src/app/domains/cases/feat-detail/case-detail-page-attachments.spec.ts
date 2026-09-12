import { BreakpointObserver } from '@angular/cdk/layout';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { ConfirmationService, MessageService } from 'primeng/api';
import { of } from 'rxjs';

import { CaseCategoriesService } from '../data/case-categories-service';
import { CaseDetailService } from '../data/case-detail-service';
import { CaseOrderStore } from '../data/case-order-store';
import { CasesService } from '../data/cases-service';
import { CaseAttachment, CaseDetail } from '../model/case';
import { CaseDetailPage } from './case-detail-page';

/** Only what the attachments read; everything else renders as its key. */
const translations = {
  caseDetail: {
    original: 'Original message',
    attachments: 'Attachments',
    attachmentsNotStored: 'The attachments were not kept when the mail came in.',
  },
};

const aCase: CaseDetail = {
  id: 'b',
  sender: 'kunde@example.com',
  recipient: 'info@musterfirma.de',
  subject: 'Angebot',
  bodyText: 'Anbei unser Angebot.',
  bodyHtml: null,
  receivedAt: new Date('2026-08-19T08:30:00Z'),
  hasAttachments: true,
  sizeBytes: 204_800,
  summary: null,
  categoryId: null,
  categoryName: null,
  categoryColor: null,
  tier: null,
  confidence: null,
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

const offer: CaseAttachment = {
  id: 'a1',
  fileName: 'Angebot Frühjahr.pdf',
  contentType: 'application/pdf',
  sizeBytes: 122_880,
  inline: false,
  contentId: null,
};
const prices: CaseAttachment = {
  id: 'a2',
  fileName: 'Preise.xlsx',
  contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  sizeBytes: 2_048,
  inline: false,
  contentId: null,
};
const logo: CaseAttachment = {
  id: 'a3',
  fileName: 'logo.png',
  contentType: 'image/png',
  sizeBytes: 900,
  inline: true,
  contentId: 'logo@kunde',
};

describe('CaseDetailPage attachments', () => {
  const detail = signal<CaseDetail | undefined>(aCase);
  const inlineImages = signal<Record<string, string> | undefined>(undefined);
  const detailServiceStub = {
    id: signal<string | null>('b'),
    detail: {
      value: detail,
      error: signal<Error | undefined>(undefined),
      isLoading: signal(false),
      hasValue: () => detail() !== undefined,
    },
    inlineImages: { value: inlineImages },
    attachmentUrl: (attachmentId: string) => `/api/cases/b/attachments/${attachmentId}`,
  } as unknown as CaseDetailService;
  const categoriesServiceStub = {
    categories: { value: signal([]), error: signal(undefined) },
  } as unknown as CaseCategoriesService;
  const casesServiceStub = { cases: { reload: () => undefined } } as unknown as CasesService;
  const breakpointsStub = {
    observe: () => of({ matches: false, breakpoints: {} }),
    isMatched: () => false,
  } as unknown as BreakpointObserver;

  beforeEach(async () => {
    detail.set(aCase);
    inlineImages.set(undefined);
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
        { provide: ConfirmationService, useValue: { confirm: () => undefined } },
        { provide: MessageService, useValue: { add: () => undefined } },
      ],
    }).compileComponents();
  });

  function createFixture() {
    const fixture = TestBed.createComponent(CaseDetailPage);
    fixture.componentRef.setInput('id', 'b');
    fixture.detectChanges();
    return fixture;
  }

  function attachmentLinks(fixture: ReturnType<typeof createFixture>): HTMLAnchorElement[] {
    return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLAnchorElement>('[data-attachment] a'));
  }

  it('lists what a person would open, each with its name, its size and the way it opens', () => {
    detail.set({ ...aCase, attachments: [logo, offer, prices] });
    const fixture = createFixture();

    const links = attachmentLinks(fixture);
    // The logo belongs into the body, not into the list.
    expect(links.map((link) => link.textContent?.replace(/\s+/g, ' ').trim())).toEqual(['Angebot Frühjahr.pdf 120 KB', 'Preise.xlsx 2 KB']);
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['/api/cases/b/attachments/a1', '/api/cases/b/attachments/a2']);
    // A PDF opens in a tab of its own; a spreadsheet is saved under its name.
    expect(links[0].getAttribute('target')).toBe('_blank');
    expect(links[0].getAttribute('rel')).toBe('noopener');
    expect(links[0].hasAttribute('download')).toBe(false);
    expect(links[1].hasAttribute('target')).toBe(false);
    expect(links[1].getAttribute('download')).toBe('Preise.xlsx');
    expect(links[0].querySelector('i')?.className).toContain('pi-file-pdf');
    expect(links[1].querySelector('i')?.className).toContain('pi-file-excel');
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('were not kept');
  });

  it('says so for a mail whose attachments were dropped before they were kept', () => {
    // The flag was set when the mail came in; nothing was stored back then.
    detail.set({ ...aCase, hasAttachments: true, attachments: [] });
    const fixture = createFixture();

    expect(attachmentLinks(fixture)).toHaveLength(0);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('The attachments were not kept when the mail came in.');
  });

  it('shows nothing about attachments for a mail that has none', () => {
    detail.set({ ...aCase, hasAttachments: false, attachments: [] });
    const fixture = createFixture();

    expect(attachmentLinks(fixture)).toHaveLength(0);
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('were not kept');
  });

  it('puts the pictures the mail brought along into the frame, as data URLs', async () => {
    detail.set({ ...aCase, bodyHtml: '<p>Anbei.</p><img src="cid:logo@kunde">', attachments: [logo] });
    const fixture = createFixture();
    const frame = () => (fixture.nativeElement as HTMLElement).querySelector('iframe')?.getAttribute('srcdoc') ?? '';

    // Until the picture is here, the reference stands as the mail wrote it.
    expect(frame()).toContain('src="cid:logo@kunde"');

    inlineImages.set({ 'logo@kunde': 'data:image/png;base64,AAAA' });
    await fixture.whenStable();

    expect(frame()).toContain('src="data:image/png;base64,AAAA"');
    expect(frame()).not.toContain('cid:');
  });
});
