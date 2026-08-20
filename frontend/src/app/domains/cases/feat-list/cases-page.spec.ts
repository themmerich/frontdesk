import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';

import { CasesStore } from '../data/cases-store';
import { Case } from '../model/case';
import { CasesPage } from './cases-page';

const translations = {
  cases: {
    title: 'Cases',
    sender: 'From',
    subject: 'Subject',
    receivedAt: 'Received',
    empty: 'No cases yet',
    loadError: 'Could not load cases.',
  },
};

describe('CasesPage', () => {
  const cases = signal<Case[]>([]);
  const error = signal<Error | undefined>(undefined);
  const storeStub = { cases: { value: cases, error } } as unknown as CasesStore;

  beforeEach(async () => {
    cases.set([]);
    error.set(undefined);
    await TestBed.configureTestingModule({
      imports: [
        CasesPage,
        TranslocoTestingModule.forRoot({
          langs: { en: translations },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
      providers: [provideZonelessChangeDetection(), { provide: CasesStore, useValue: storeStub }],
    }).compileComponents();
  });

  it('shows the title and the cases from the store', () => {
    cases.set([
      {
        id: '1',
        sender: 'anna@example.com',
        subject: 'Delivery status',
        receivedAt: '2026-08-19T08:30:00Z',
        hasAttachments: false,
        sizeBytes: 2048,
      },
    ]);
    const fixture = TestBed.createComponent(CasesPage);
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent;
    expect(text).toContain('Cases');
    expect(text).toContain('anna@example.com');
  });

  it('shows the load error when the API is unreachable', () => {
    error.set(new Error('connection refused'));
    const fixture = TestBed.createComponent(CasesPage);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Could not load cases.');
  });
});
