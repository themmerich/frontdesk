import { computed, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { UIChart } from 'primeng/chart';

import { CaseStatisticsService } from '../data/case-statistics-service';
import { ArrivalBucket, CaseStatistics } from '../model/case-statistics';
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
    archived: 'In the archive',
    trashed: 'In the trash',
    refresh: 'Refresh',
    today: 'Today',
    week: 'Last 7 days',
    month: 'Last 30 days',
    comparedTo: { today: 'vs. yesterday', week: 'vs. previous week', month: 'vs. previous month' },
    period: { today: 'Today', week: '7 days', month: '30 days', year: '12 months' },
    byCategory: 'Cases per category',
    byTier: 'Cases per tier',
    arrivals: 'Arrivals',
    withoutCategory: 'Without a category',
    everyCategory: 'All categories',
    filterCategory: 'Arrivals by category',
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

/** Buckets as the server sends them: the full run, named by where each one begins. */
function buckets(periods: string[], counts: Record<string, Record<string, number>> = {}): ArrivalBucket[] {
  return periods.map((period) => {
    const byCategory = counts[period] ?? {};
    return {
      period,
      count: Object.values(byCategory).reduce((sum, count) => sum + count, 0),
      byCategory,
    };
  });
}

function days(counts: Record<string, Record<string, number>> = {}): ArrivalBucket[] {
  // Thirty consecutive days ending on a fixed one, so a label never depends on the day the test runs.
  const periods = Array.from({ length: 30 }, (_, index) => {
    const day = new Date(Date.UTC(2026, 8, 15));
    day.setUTCDate(day.getUTCDate() - (29 - index));
    return day.toISOString().slice(0, 10);
  });
  return buckets(periods, counts);
}

function statisticsFor(overrides: Partial<CaseStatistics> = {}): CaseStatistics {
  return {
    totals: { all: 0, untriaged: 0, manual: 0, archived: 0, trashed: 0 },
    windows: { today: { count: 0, previous: 0 }, week: { count: 0, previous: 0 }, month: { count: 0, previous: 0 } },
    byCategory: [],
    byTier: [
      { tier: 'automatic', count: 0 },
      { tier: 'draft', count: 0 },
      { tier: 'manual', count: 0 },
      { tier: 'info', count: 0 },
      { tier: 'ignore', count: 0 },
      { tier: null, count: 0 },
    ],
    hours: buckets(Array.from({ length: 24 }, (_, hour) => `2026-09-15T${String(hour).padStart(2, '0')}`)),
    days: days(),
    months: buckets(Array.from({ length: 12 }, (_, index) => `2026-${String(index + 1).padStart(2, '0')}`)),
    ...overrides,
  };
}

describe('DashboardPage', () => {
  const statistics = signal<CaseStatistics | undefined>(undefined);
  const error = signal<unknown>(undefined);
  const status = signal<'loading' | 'reloading' | 'resolved'>('resolved');
  const isLoading = computed(() => status() !== 'resolved');
  const reload = vi.fn();

  beforeEach(async () => {
    // PrimeNG's overlay queries matchMedia via the document's view; JSDOM does not implement it.
    const view = document.defaultView as unknown as { matchMedia?: (query: string) => Partial<MediaQueryList> };
    view.matchMedia ??= (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    });

    statistics.set(statisticsFor());
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
        {
          provide: CaseStatisticsService,
          // Nothing is counted here: the page draws the sums the server already made.
          useValue: { statistics: { value: statistics, error, status, isLoading, reload } },
        },
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

  it('shows the tiles the server counted', () => {
    statistics.set(statisticsFor({ totals: { all: 4, untriaged: 1, manual: 2, archived: 3, trashed: 2 } }));

    const text = (createFixture().nativeElement as HTMLElement).textContent;

    expect(text).toContain('Cases in total');
    expect(text).toMatch(/Cases in total\s*4/);
    expect(text).toMatch(/Not triaged yet\s*1/);
    expect(text).toMatch(/Waiting for an answer\s*2/);
    expect(text).toMatch(/In the archive\s*3/);
    expect(text).toMatch(/In the trash\s*2/);
  });

  it('marks a trend with a triangle that points and carries the colour', () => {
    statistics.set(
      statisticsFor({
        windows: { today: { count: 2, previous: 1 }, week: { count: 9, previous: 4 }, month: { count: 30, previous: 20 } },
      }),
    );

    const element = createFixture().nativeElement as HTMLElement;

    const trends = Array.from(element.querySelectorAll('[data-trend]')).map((trend) => [
      trend.getAttribute('data-trend'),
      trend.querySelector('i')?.className,
    ]);
    // All three stretches hold more than the ones before them; styles.css draws "up" green.
    expect(trends.map(([direction]) => direction)).toEqual(['up', 'up', 'up']);
    expect(trends.every(([, icon]) => icon?.includes('pi-caret-up'))).toBe(true);
  });

  it('leaves a stretch that did not move without a direction, and without a colour', () => {
    const element = createFixture().nativeElement as HTMLElement;

    // Nothing to point at, so there is no attribute for styles.css to colour — only the dash.
    expect(element.querySelectorAll('[data-trend]')).toHaveLength(0);
    expect(element.querySelectorAll('i.pi-minus').length).toBe(3);
  });

  it('measures each stretch against the one before it', () => {
    statistics.set(
      statisticsFor({
        windows: { today: { count: 2, previous: 1 }, week: { count: 3, previous: 0 }, month: { count: 3, previous: 0 } },
      }),
    );

    const text = (createFixture().nativeElement as HTMLElement).textContent;

    expect(text).toMatch(/Today\s*2/);
    // The space before the percent sign is a non-breaking one.
    expect(text).toMatch(/\+100\s%/);
    expect(text).toContain('vs. yesterday');
    // Against nothing there is no percentage to give, only the number itself.
    expect(text).toMatch(/Last 7 days\s*3/);
    expect(text).toContain('+3');
    expect(text).toContain('vs. previous week');
  });

  it('draws the categories, the tiers and the arrivals as they were handed over', () => {
    statistics.set(
      statisticsFor({
        byCategory: [
          { id: 'c1', name: 'Statusanfrage', color: 'blue', count: 2 },
          { id: null, name: null, color: null, count: 1 },
        ],
        byTier: [
          { tier: 'automatic', count: 2 },
          { tier: 'draft', count: 0 },
          { tier: 'manual', count: 0 },
          { tier: 'info', count: 0 },
          { tier: 'ignore', count: 0 },
          { tier: null, count: 1 },
        ],
        days: days({ '2026-09-15': { c1: 2, none: 1 } }),
      }),
    );

    const fixture = createFixture();

    expect(fixture.debugElement.queryAll(By.directive(UIChart))).toHaveLength(3);
    const categories = chartData(fixture, 0);
    expect(categories.labels).toEqual(['Statusanfrage', 'Without a category']);
    expect(categories.datasets[0].data).toEqual([2, 1]);
    const tiers = chartData(fixture, 1);
    // The ladder comes in order from the server, gaps and the untriaged behind it included.
    expect(tiers.labels).toEqual(['Automatic', 'Draft', 'Manual', 'Info', 'Ignore', 'Not triaged']);
    expect(tiers.datasets[0].data).toEqual([2, 0, 0, 0, 0, 1]);
    const arrivals = chartData(fixture, 2);
    expect(arrivals.labels).toHaveLength(30);
    expect(arrivals.datasets[0].data.at(-1)).toBe(3);
  });

  it('switches the steps of the arrivals chart without asking again', async () => {
    const fixture = createFixture();
    await fixture.whenStable();
    reload.mockClear();

    // Thirty days to begin with, one point per day.
    expect(chartData(fixture, 2).labels).toHaveLength(30);

    const element = fixture.nativeElement as HTMLElement;
    // Each option of the select button renders as a toggle button carrying its label.
    const period = (label: string) => element.querySelector<HTMLElement>(`p-togglebutton[aria-label="${label}"]`)!;
    period('Today').click();
    await fixture.whenStable();
    expect(chartData(fixture, 2).labels).toHaveLength(24);

    period('7 days').click();
    await fixture.whenStable();
    // The week is the last seven of the thirty days; the server sends them once.
    expect(chartData(fixture, 2).labels).toHaveLength(7);

    period('12 months').click();
    await fixture.whenStable();
    expect(chartData(fixture, 2).labels).toHaveLength(12);

    // Every series came with the one reading, so switching costs no request.
    expect(reload).not.toHaveBeenCalled();
  });

  it('narrows the arrivals to one category, and offers the ones the cases carry', async () => {
    statistics.set(
      statisticsFor({
        byCategory: [
          { id: 'c1', name: 'Jobsuche', color: 'blue', count: 2 },
          { id: 'c2', name: 'Werbung', color: 'amber', count: 1 },
          { id: null, name: null, color: null, count: 1 },
        ],
        days: days({ '2026-09-15': { c1: 2, c2: 1, none: 1 } }),
        totals: { all: 4, untriaged: 1, manual: 0, archived: 0, trashed: 0 },
      }),
    );
    const fixture = createFixture();
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    reload.mockClear();

    // Everything to begin with: all four on today's point.
    expect(chartData(fixture, 2).datasets[0].data.at(-1)).toBe(4);

    (element.querySelector('p-select') as HTMLElement).click();
    await fixture.whenStable();
    const options = Array.from(document.querySelectorAll('li[role="option"]'));
    // The largest category first, as in the doughnut, and the uncategorised at the very end.
    expect(options.map((option) => option.textContent?.trim())).toEqual(['All categories', 'Jobsuche', 'Werbung', 'Without a category']);

    (options[2] as HTMLElement).click();
    await fixture.whenStable();

    // Only the one case filed under Werbung is left on the chart, and it came out of the bucket.
    expect(chartData(fixture, 2).datasets[0].data.at(-1)).toBe(1);
    expect(reload).not.toHaveBeenCalled();
    // The numbers above the chart are not part of the filter.
    expect(element.textContent).toMatch(/Cases in total\s*4/);
  });

  it('goes back to every category when the one picked is no longer among the cases', async () => {
    statistics.set(
      statisticsFor({
        byCategory: [
          { id: 'c1', name: 'Jobsuche', color: 'blue', count: 1 },
          { id: null, name: null, color: null, count: 1 },
        ],
        days: days({ '2026-09-15': { c1: 1, none: 1 } }),
      }),
    );
    const fixture = createFixture();
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;

    (element.querySelector('p-select') as HTMLElement).click();
    await fixture.whenStable();
    (document.querySelectorAll('li[role="option"]')[1] as HTMLElement).click();
    await fixture.whenStable();
    expect(chartData(fixture, 2).datasets[0].data.at(-1)).toBe(1);

    // Read again, and the Jobsuche case is gone.
    statistics.set(
      statisticsFor({
        byCategory: [{ id: null, name: null, color: null, count: 1 }],
        days: days({ '2026-09-15': { none: 1 } }),
      }),
    );
    (element.querySelector('p-button button') as HTMLButtonElement).click();
    await fixture.whenStable();

    expect(element.querySelector('p-select')?.textContent).toContain('All categories');
    expect(chartData(fixture, 2).datasets[0].data.at(-1)).toBe(1);
  });

  it('reads again when the refresh button is pressed', async () => {
    statistics.set(statisticsFor({ totals: { all: 1, untriaged: 1, manual: 0, archived: 0, trashed: 0 } }));
    const fixture = createFixture();
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toMatch(/Cases in total\s*1/);

    // What arrived while the page stood still.
    statistics.set(statisticsFor({ totals: { all: 2, untriaged: 2, manual: 0, archived: 0, trashed: 0 } }));
    (element.querySelector('p-button button') as HTMLButtonElement).click();
    await fixture.whenStable();

    expect(reload).toHaveBeenCalledTimes(1);
    expect(element.textContent).toMatch(/Cases in total\s*2/);
  });

  it('shows zeroes rather than nothing while the answer is still on its way', async () => {
    status.set('loading');
    statistics.set(undefined);

    const fixture = createFixture();
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).textContent).toMatch(/Cases in total\s*0/);

    statistics.set(statisticsFor({ totals: { all: 2, untriaged: 2, manual: 0, archived: 0, trashed: 0 } }));
    status.set('resolved');
    await fixture.whenStable();

    expect((fixture.nativeElement as HTMLElement).textContent).toMatch(/Cases in total\s*2/);
  });

  it('says so when the numbers cannot be loaded, instead of drawing an empty chart', () => {
    error.set(new Error('offline'));

    const fixture = createFixture();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Cases could not be loaded.');
    expect(fixture.debugElement.queryAll(By.directive(UIChart))).toHaveLength(0);
  });
});
