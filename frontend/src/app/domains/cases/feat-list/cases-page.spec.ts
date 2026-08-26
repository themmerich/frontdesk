import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { Confirmation, ConfirmationService, MessageService, ToastMessageOptions } from 'primeng/api';

import { CasesService } from '../data/cases-service';
import { Case } from '../model/case';
import { CasesPage } from './cases-page';

const translations = {
  cases: {
    title: 'Cases',
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
  const casesServiceStub = {
    cases: { value: cases, error },
    remove: (ids: string[]) => {
      removed.push(ids);
      return removeFails ? Promise.reject(new Error('nope')) : Promise.resolve();
    },
  } as unknown as CasesService;

  let toasts: ToastMessageOptions[];
  let confirmations: Confirmation[];

  beforeEach(async () => {
    cases.set([]);
    error.set(undefined);
    removed = [];
    removeFails = false;
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
        { provide: CasesService, useValue: casesServiceStub },
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

  it('shows the title and the cases from the store', () => {
    cases.set([
      {
        id: '1',
        sender: 'anna@example.com',
        recipient: 'info@example.com',
        subject: 'Delivery status',
        receivedAt: new Date('2026-08-19T08:30:00Z'),
        hasAttachments: false,
        sizeBytes: 2048,
        summary: null,
        categoryName: null,
        categoryColor: null,
        tier: null,
        confidence: null,
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
