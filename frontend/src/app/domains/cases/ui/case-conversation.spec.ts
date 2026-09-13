import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';

import { CaseAttachment, CaseMessage } from '../model/case';
import { CaseConversation } from './case-conversation';

const translations = {
  caseDetail: {
    replyBy: 'Reply by {{name}}',
    remoteBlocked: 'Pictures from the internet were not loaded.',
    showRemote: 'Show pictures',
    htmlMail: 'Message',
    attachments: 'Attachments',
  },
};

function mail(overrides: Partial<CaseMessage> = {}): CaseMessage {
  return {
    id: 'm1',
    direction: 'incoming',
    sender: 'kunde@example.com',
    recipient: 'info@musterfirma.de',
    subject: 'Lieferung 4711',
    bodyText: 'Wann kommt die Lieferung?',
    bodyHtml: null,
    occurredAt: new Date('2026-08-19T08:30:00Z'),
    sizeBytes: 2048,
    sentByName: null,
    attachments: [],
    ...overrides,
  };
}

const offer: CaseAttachment = {
  id: 'a1',
  fileName: 'Angebot.pdf',
  contentType: 'application/pdf',
  sizeBytes: 122_880,
  inline: false,
  contentId: null,
};
const logo: CaseAttachment = {
  id: 'a2',
  fileName: 'logo.png',
  contentType: 'image/png',
  sizeBytes: 900,
  inline: true,
  contentId: 'logo@kunde',
};

describe('CaseConversation', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        CaseConversation,
        TranslocoTestingModule.forRoot({
          langs: { en: translations },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
  });

  function render(messages: CaseMessage[], inlineImages?: Record<string, string>): ComponentFixture<CaseConversation> {
    const fixture = TestBed.createComponent(CaseConversation);
    fixture.componentRef.setInput('messages', messages);
    fixture.componentRef.setInput('inlineImages', inlineImages);
    fixture.componentRef.setInput('attachmentUrl', (id: string) => `/api/cases/b/attachments/${id}`);
    fixture.detectChanges();
    return fixture;
  }

  function details(fixture: ComponentFixture<CaseConversation>): HTMLDetailsElement[] {
    return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLDetailsElement>('details[data-message]'));
  }

  it('tells the conversation oldest first, the newest message open and the rest folded', () => {
    const fixture = render([
      mail(),
      mail({
        id: 'm2',
        direction: 'outgoing',
        sender: 'inbox@frontdesk.local',
        sentByName: 'Anna Muster',
        bodyText: 'Morgen.',
        occurredAt: new Date('2026-08-19T09:00:00Z'),
      }),
      mail({ id: 'm3', bodyText: 'Danke!', occurredAt: new Date('2026-08-19T10:00:00Z') }),
    ]);

    const shown = details(fixture);
    expect(shown.map((entry) => entry.getAttribute('data-direction'))).toEqual(['incoming', 'outgoing', 'incoming']);
    expect(shown.map((entry) => entry.open)).toEqual([false, false, true]);
    // Who wrote it: the customer by address, the house by the name of whoever pressed the button.
    expect(shown[0].querySelector('summary')?.textContent).toContain('kunde@example.com');
    expect(shown[1].querySelector('summary')?.textContent).toContain('Reply by Anna Muster');
    expect(shown[2].textContent).toContain('Danke!');
  });

  it('shows a mail written in HTML in a frame that may do nothing, and text as text with its addresses clickable', () => {
    const fixture = render([
      mail({ bodyHtml: '<p>Hallo <b>Welt</b></p>' }),
      mail({ id: 'm2', bodyText: 'Status unter https://example.com/status/4711 (dort).\nMehr auf www.example.com/faq.' }),
    ]);
    const element = fixture.nativeElement as HTMLElement;

    const frame = element.querySelector('iframe')!;
    expect(frame.getAttribute('sandbox')).toBe('allow-popups allow-popups-to-escape-sandbox');
    expect(frame.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(frame.getAttribute('srcdoc')).toContain('<p>Hallo <b>Welt</b></p>');
    expect(frame.getAttribute('srcdoc')).toContain("default-src 'none'");
    // The text mail: addresses become links to a new tab, an address without a scheme gets one.
    const links = Array.from(element.querySelectorAll('.whitespace-pre-wrap a'));
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['https://example.com/status/4711', 'https://www.example.com/faq']);
    expect(links.every((link) => link.getAttribute('rel') === 'noopener noreferrer')).toBe(true);
    expect(element.textContent).toContain('(dort).');
  });

  it('holds the pictures of the internet back until asked, once for the whole conversation', () => {
    const fixture = render([
      mail({ bodyHtml: '<img src="https://tracker.example.com/pixel.gif">' }),
      mail({ id: 'm2', bodyHtml: '<p>Danke</p>' }),
    ]);
    const element = fixture.nativeElement as HTMLElement;

    expect(element.textContent).toContain('Pictures from the internet were not loaded.');
    const frames = () => Array.from(element.querySelectorAll('iframe')).map((frame) => frame.getAttribute('srcdoc') ?? '');
    expect(frames().every((document) => document.includes('img-src data:;'))).toBe(true);

    Array.from(element.querySelectorAll('button'))
      .find((candidate) => candidate.textContent?.includes('Show pictures'))!
      .click();
    fixture.detectChanges();

    expect(frames().every((document) => document.includes('img-src data: https:'))).toBe(true);
    expect(element.textContent).not.toContain('Pictures from the internet were not loaded.');
  });

  it('says nothing about pictures for mails that carry everything they show', () => {
    const fixture = render([mail({ bodyHtml: '<p>Hallo</p><img src="cid:logo@kunde">' })]);

    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Pictures from the internet were not loaded.');
  });

  it('puts the pictures a mail brought along into its frame, and lists the rest under it', () => {
    const fixture = render([mail({ bodyHtml: '<p>Anbei.</p><img src="cid:logo@kunde">', attachments: [logo, offer] })], {
      'logo@kunde': 'data:image/png;base64,AAAA',
    });
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('iframe')!.getAttribute('srcdoc')).toContain('src="data:image/png;base64,AAAA"');
    // The logo belongs into the body, not into the list; the offer opens in a tab of its own.
    const links = Array.from(element.querySelectorAll<HTMLAnchorElement>('[data-attachment] a'));
    expect(links.map((link) => link.textContent?.replace(/\s+/g, ' ').trim())).toEqual(['Angebot.pdf 120 KB']);
    expect(links[0].getAttribute('href')).toBe('/api/cases/b/attachments/a1');
    expect(links[0].getAttribute('target')).toBe('_blank');
    expect(links[0].querySelector('i')?.className).toContain('pi-file-pdf');
  });
});
