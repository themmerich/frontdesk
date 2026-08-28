import { computed, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { UIChart } from 'primeng/chart';

import { CasesService } from '../data/cases-service';
import { Case } from '../model/case';
import { DashboardPage } from './dashboard-page';

// A canvas has no drawing context in JSDOM, and Chart.js refuses to be built without one. The
// page hands its data to the chart component either way, which is what these tests read.
vi.mock('chart.js/auto', () => ({
  default: class {
    destroy(): void {
      /* nothing to tear down */
    }
    update(): void {
      /* nothing to draw */
    }
  },
}));

const translations = {
  dashboard: {
    title: 'Dashboard',
    total: 'Cases in total',
    untriaged: 'Not triaged yet',
    needsAnswer: 'Waiting for an answer',
    today: 'Arrived today',
    byCategory: 'Cases per category',
    byTier: 'Cases per tier',
    arrivals: 'Arrivals',
    withoutCategory: 'Without a category',
    notTriaged: 'Not triaged',
  },
  cases: {
    tierAutomatic: 'Automatic',
    tierDraft: 'Draft',
    tierManual: 'Manual',
    tierInfo: 'Info',
    tierIgnore: 'Ignore',
    loadError: 'Cases could not be loaded.',
  },
};

function aCase(overrides: Partial<Case> = {}): Case {
  return {
    id: '1',
    sender: 'anna@example.com',
    recipient: 'info@example.com',
    subject: 'Delivery status',
    receivedAt: new Date(),
    hasAttachments: false,
    sizeBytes: 2048,
    summary: null,
    categoryName: null,
    categoryColor: null,
    tier: null,
    confidence: null,
    ...overrides,
  };
}

describe('DashboardPage', () => {
  const cases = signal<Case[]>([]);
  const error = signal<unknown>(undefined);
  const status = signal<'loading' | 'reloading' | 'resolved'>('resolved');
  const isLoading = computed(() => status() !== 'resolved');
  const reload = vi.fn();

  beforeEach(async () => {
    cases.set([]);
    error.set(undefined);
    status.set('resolved');
    reload.mockClear();
    await TestBed.configureTestingModule({
      imports: [
        DashboardPage,
        TranslocoTestingModule.forRoot({
          langs: { en: translations },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
      providers: [
        provideZonelessChangeDetection(),
        { provide: CasesService, useValue: { cases: { value: cases, error, status, isLoading, reload } } },
      ],
    }).compileComponents();
  });

  function createFixture() {
    const fixture = TestBed.createComponent(DashboardPage);
    fixture.detectChanges();
    return fixture;
  }

  function chartData(fixture: ReturnType<typeof createFixture>, index: number): { labels: string[]; datasets: { data: number[] }[] } {
    const charts = fixture.debugElement.queryAll(By.directive(UIChart));
    return charts[index].componentInstance.data() as { labels: string[]; datasets: { data: number[] }[] };
  }

  it('counts what the inbox holds, and what of it is waiting for someone', () => {
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);
    const yesterday = new Date(midnight);
    yesterday.setDate(yesterday.getDate() - 1);
    cases.set([
      aCase({ tier: 'automatic' }),
      aCase({ id: '2', tier: 'manual' }),
      aCase({ id: '3', tier: 'draft' }),
      // Not triaged, and not from today either.
      aCase({ id: '4', receivedAt: yesterday }),
    ]);

    const text = (createFixture().nativeElement as HTMLElement).textContent;

    expect(text).toContain('Cases in total');
    // Four in total, one untriaged, two on someone's desk, three of them from today.
    expect(text).toMatch(/Cases in total\s*4/);
    expect(text).toMatch(/Not triaged yet\s*1/);
    expect(text).toMatch(/Waiting for an answer\s*2/);
    expect(text).toMatch(/Arrived today\s*3/);
  });

  it('draws the categories, the tiers and the arrivals', () => {
    cases.set([
      aCase({ categoryName: 'Statusanfrage', categoryColor: 'blue', tier: 'automatic' }),
      aCase({ id: '2', categoryName: 'Statusanfrage', categoryColor: 'blue', tier: 'automatic' }),
      aCase({ id: '3' }),
    ]);

    const fixture = createFixture();

    expect(fixture.debugElement.queryAll(By.directive(UIChart))).toHaveLength(3);
    const categories = chartData(fixture, 0);
    expect(categories.labels).toEqual(['Statusanfrage', 'Without a category']);
    expect(categories.datasets[0].data).toEqual([2, 1]);
    const tiers = chartData(fixture, 1);
    expect(tiers.labels).toEqual(['Automatic', 'Draft', 'Manual', 'Info', 'Ignore', 'Not triaged']);
    expect(tiers.datasets[0].data).toEqual([2, 0, 0, 0, 0, 1]);
    // Fourteen days, and today's three cases on the last of them.
    const arrivals = chartData(fixture, 2);
    expect(arrivals.labels).toHaveLength(14);
    expect(arrivals.datasets[0].data.at(-1)).toBe(3);
  });

  it('asks for fresh cases when it opens, and keeps that one reading', async () => {
    cases.set([aCase({ tier: 'automatic' })]);

    const fixture = createFixture();
    await fixture.whenStable();

    // Not whatever the last poll left behind: this visit gets its own answer.
    expect(reload).toHaveBeenCalledTimes(1);
    expect((fixture.nativeElement as HTMLElement).textContent).toMatch(/Cases in total\s*1/);

    // What the ten-second poll does behind the page: it reloads and settles again on new cases.
    // Redrawing on that is what made the charts flicker, so the page stays on what it opened with.
    status.set('reloading');
    await fixture.whenStable();
    cases.set([aCase({ tier: 'automatic' }), aCase({ id: '2', tier: 'manual' })]);
    status.set('resolved');
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).textContent).toMatch(/Cases in total\s*1/);
    expect(chartData(fixture, 1).datasets[0].data).toEqual([1, 0, 0, 0, 0, 0]);
  });

  it('waits for the answer to settle before it reads anything', async () => {
    status.set('loading');
    cases.set([]);

    const fixture = createFixture();
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).textContent).toMatch(/Cases in total\s*0/);

    // The default value of an unsettled resource is empty; the page waits it out.
    cases.set([aCase(), aCase({ id: '2' })]);
    status.set('resolved');
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).textContent).toMatch(/Cases in total\s*2/);
  });

  it('reads again when the refresh button is pressed', async () => {
    cases.set([aCase()]);
    const fixture = createFixture();
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toMatch(/Cases in total\s*1/);

    // What arrived while the page stood still.
    cases.set([aCase(), aCase({ id: '2' })]);
    (element.querySelector('p-button button') as HTMLButtonElement).click();
    await fixture.whenStable();

    expect(reload).toHaveBeenCalledTimes(2);
    expect(element.textContent).toMatch(/Cases in total\s*2/);
  });

  it('says so when the cases cannot be loaded, instead of drawing an empty chart', () => {
    error.set(new Error('offline'));

    const fixture = createFixture();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Cases could not be loaded.');
    expect(fixture.debugElement.queryAll(By.directive(UIChart))).toHaveLength(0);
  });
});
