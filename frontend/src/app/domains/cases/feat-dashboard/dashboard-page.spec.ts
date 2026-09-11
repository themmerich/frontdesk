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
    categoryId: null,
    categoryName: null,
    categoryColor: null,
    tier: null,
    confidence: null,
    handledAt: null,
    deletedAt: null,
    hasDraft: false,
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
    // PrimeNG's overlay queries matchMedia via the document's view; JSDOM does not implement it.
    const view = document.defaultView as unknown as { matchMedia?: (query: string) => Partial<MediaQueryList> };
    view.matchMedia ??= (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    });

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
        {
          provide: CasesService,
          // The page reads the whole list once and splits it itself, so every number on it comes
          // from the same reading.
          useValue: { cases: { value: cases, error, status, isLoading, reload } },
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
    expect(text).toMatch(/Today\s*3/);
  });

  it('counts what is in the archive and in the trash, and leaves the trash out of the rest', () => {
    cases.set([
      aCase({ id: '1', tier: 'manual' }),
      aCase({ id: '2', tier: 'info', handledAt: new Date() }),
      aCase({ id: '3', tier: 'info', handledAt: new Date() }),
      aCase({ id: '4', tier: 'manual', deletedAt: new Date() }),
      // Thrown away after it was ticked off: it counts as trash, not as archive.
      aCase({ id: '5', tier: 'info', handledAt: new Date(), deletedAt: new Date() }),
    ]);

    const text = (createFixture().nativeElement as HTMLElement).textContent;

    expect(text).toMatch(/In the archive\s*2/);
    expect(text).toMatch(/In the trash\s*2/);
    // Three left over, and the two in the trash are in none of the numbers about the work.
    expect(text).toMatch(/Cases in total\s*3/);
    expect(text).toMatch(/Waiting for an answer\s*1/);
  });

  it('marks a trend with a triangle that points and carries the colour', () => {
    const hoursAgo = (hours: number) => {
      const then = new Date();
      then.setHours(then.getHours() - hours);
      return then;
    };
    cases.set([
      aCase({ receivedAt: hoursAgo(1) }),
      aCase({ id: '2', receivedAt: hoursAgo(2) }),
      aCase({ id: '3', receivedAt: hoursAgo(25) }),
    ]);

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
    cases.set([]);

    const element = createFixture().nativeElement as HTMLElement;

    // Nothing to point at, so there is no attribute for styles.css to colour — only the dash.
    expect(element.querySelectorAll('[data-trend]')).toHaveLength(0);
    expect(element.querySelectorAll('i.pi-minus').length).toBe(3);
  });

  it('draws the categories, the tiers and the arrivals', () => {
    cases.set([
      aCase({ categoryId: 'c1', categoryName: 'Statusanfrage', categoryColor: 'blue', tier: 'automatic' }),
      aCase({ id: '2', categoryId: 'c1', categoryName: 'Statusanfrage', categoryColor: 'blue', tier: 'automatic' }),
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
    // Thirty days to begin with, and today's three cases on the last of them.
    const arrivals = chartData(fixture, 2);
    expect(arrivals.labels).toHaveLength(30);
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

  it('measures the last stretches against the ones before them', async () => {
    const hoursAgo = (hours: number) => {
      const then = new Date();
      then.setHours(then.getHours() - hours);
      return then;
    };
    cases.set([
      // Two today, one yesterday around the same time: twice as many as the day before.
      aCase({ receivedAt: hoursAgo(1) }),
      aCase({ id: '2', receivedAt: hoursAgo(2) }),
      aCase({ id: '3', receivedAt: hoursAgo(25) }),
    ]);

    const text = (createFixture().nativeElement as HTMLElement).textContent;

    expect(text).toMatch(/Today\s*2/);
    // The space before the percent sign is a non-breaking one.
    expect(text).toMatch(/\+100\s%/);
    expect(text).toContain('vs. yesterday');
    // Nothing in the seven days before the last seven, so there is no percentage to give.
    expect(text).toMatch(/Last 7 days\s*3/);
    expect(text).toContain('+3');
    expect(text).toContain('vs. previous week');
    expect(text).toMatch(/Last 30 days\s*3/);
  });

  it('counts the arrivals in the steps the chosen period asks for', async () => {
    cases.set([aCase()]);
    const fixture = createFixture();
    await fixture.whenStable();

    // Thirty days to begin with, one point per day.
    expect(chartData(fixture, 2).labels).toHaveLength(30);

    const element = fixture.nativeElement as HTMLElement;
    // Each option of the select button renders as a toggle button carrying its label.
    const period = (label: string) => element.querySelector<HTMLElement>(`p-togglebutton[aria-label="${label}"]`)!;
    period('Today').click();
    await fixture.whenStable();
    // Today, one point per hour.
    expect(chartData(fixture, 2).labels).toHaveLength(24);

    period('12 months').click();
    await fixture.whenStable();
    expect(chartData(fixture, 2).labels).toHaveLength(12);
  });

  it('narrows the arrivals to one category, and offers the ones the cases carry', async () => {
    cases.set([
      aCase({ categoryId: 'c1', categoryName: 'Jobsuche' }),
      aCase({ id: '2', categoryId: 'c1', categoryName: 'Jobsuche' }),
      aCase({ id: '3', categoryId: 'c2', categoryName: 'Werbung' }),
      aCase({ id: '4' }),
    ]);
    const fixture = createFixture();
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;

    // Everything to begin with: all four on today's point.
    expect(chartData(fixture, 2).datasets[0].data.at(-1)).toBe(4);

    (element.querySelector('p-select') as HTMLElement).click();
    await fixture.whenStable();
    const options = Array.from(document.querySelectorAll('li[role="option"]'));
    // The largest category first, as in the doughnut, and the uncategorised at the very end.
    expect(options.map((option) => option.textContent?.trim())).toEqual(['All categories', 'Jobsuche', 'Werbung', 'Without a category']);

    (options[2] as HTMLElement).click();
    await fixture.whenStable();

    // Only the one case filed under Werbung is left on the chart.
    expect(chartData(fixture, 2).datasets[0].data.at(-1)).toBe(1);
    // The numbers above the chart are not part of the filter.
    expect(element.textContent).toMatch(/Cases in total\s*4/);
  });

  it('goes back to every category when the one picked is no longer among the cases', async () => {
    cases.set([aCase({ categoryId: 'c1', categoryName: 'Jobsuche' }), aCase({ id: '2' })]);
    const fixture = createFixture();
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;

    (element.querySelector('p-select') as HTMLElement).click();
    await fixture.whenStable();
    (document.querySelectorAll('li[role="option"]')[1] as HTMLElement).click();
    await fixture.whenStable();
    expect(chartData(fixture, 2).datasets[0].data.at(-1)).toBe(1);

    // Read again, and the Jobsuche case is gone.
    cases.set([aCase({ id: '2' })]);
    (element.querySelector('p-button button') as HTMLButtonElement).click();
    await fixture.whenStable();

    expect(element.querySelector('p-select')?.textContent).toContain('All categories');
    expect(chartData(fixture, 2).datasets[0].data.at(-1)).toBe(1);
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
