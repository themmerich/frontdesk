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
      { id: '1', sender: 'anna@example.com', subject: 'Delivery status', receivedAt: '2026-08-19T08:30:00Z' },
      { id: '2', sender: 'ben@example.com', subject: 'Invoice copy', receivedAt: '2026-08-19T09:15:00Z' },
    ]);

    const text = (fixture.nativeElement as HTMLElement).textContent;
    expect(text).toContain('anna@example.com');
    expect(text).toContain('Delivery status');
    expect(text).toContain('ben@example.com');
    expect(text).toContain('Invoice copy');
  });

  it('shows the empty message when there are no cases', () => {
    const fixture = createFixture([]);

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No cases yet');
  });

  it('offers sorting on every column and filters for sender and subject', () => {
    const fixture = createFixture([]);

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelectorAll('th[psortablecolumn]')).toHaveLength(3);
    expect(element.querySelectorAll('p-columnfilter')).toHaveLength(2);
  });
});
