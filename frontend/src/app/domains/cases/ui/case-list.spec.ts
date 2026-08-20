import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';

import { Case } from '../model/case';
import { CaseList } from './case-list';

const translations = {
  cases: {
    sender: 'From',
    subject: 'Subject',
    receivedAt: 'Received',
    attachment: 'Attachment',
    hasAttachment: 'Has attachment',
    size: 'Size',
    filter: 'Filter …',
    empty: 'No cases yet',
  },
};

describe('CaseList', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        CaseList,
        TranslocoTestingModule.forRoot({
          langs: { en: translations },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
  });

  function createFixture(cases: Case[]) {
    const fixture = TestBed.createComponent(CaseList);
    fixture.componentRef.setInput('cases', cases);
    fixture.detectChanges();
    return fixture;
  }

  it('renders one row per case', () => {
    const fixture = createFixture([
      {
        id: '1',
        sender: 'anna@example.com',
        subject: 'Delivery status',
        receivedAt: '2026-08-19T08:30:00Z',
        hasAttachments: false,
        sizeBytes: 2048,
      },
      {
        id: '2',
        sender: 'ben@example.com',
        subject: 'Invoice copy',
        receivedAt: '2026-08-19T09:15:00Z',
        hasAttachments: true,
        sizeBytes: 1.4 * 1024 * 1024,
      },
    ]);

    const text = (fixture.nativeElement as HTMLElement).textContent;
    expect(text).toContain('anna@example.com');
    expect(text).toContain('Delivery status');
    expect(text).toContain('ben@example.com');
    expect(text).toContain('Invoice copy');
  });

  it('shows the attachment icon and the formatted size', () => {
    const fixture = createFixture([
      {
        id: '1',
        sender: 'anna@example.com',
        subject: 'No attachment',
        receivedAt: '2026-08-19T08:30:00Z',
        hasAttachments: false,
        sizeBytes: 2048,
      },
      {
        id: '2',
        sender: 'ben@example.com',
        subject: 'With attachment',
        receivedAt: '2026-08-19T09:15:00Z',
        hasAttachments: true,
        sizeBytes: 1.4 * 1024 * 1024,
      },
    ]);

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelectorAll('.pi-paperclip')).toHaveLength(1);
    expect(element.textContent).toContain('2 KB');
    expect(element.textContent).toContain('1.4 MB');
  });

  it('shows the empty message when there are no cases', () => {
    const fixture = createFixture([]);

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No cases yet');
  });

  it('offers sorting on sender, subject, size, and received, and filters for sender and subject', () => {
    const fixture = createFixture([]);

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelectorAll('th[psortablecolumn]')).toHaveLength(4);
    expect(element.querySelectorAll('p-columnfilter')).toHaveLength(2);
  });
});
