import { computed, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TranslocoTestingModule } from '@jsverse/transloco';
import { UIChart } from 'primeng/chart';

import { AiUsageService } from '../data/ai-usage-service';
import { AiUsage, AiUsageWindow } from '../model/ai-usage';
import { AiCostsPage } from './ai-costs-page';

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
  aiCosts: {
    title: 'AI costs',
    refresh: 'Refresh',
    intro: 'Estimated from the tokens.',
    unpriced: '{{count}} calls have no priced model.',
    today: 'Today',
    week: 'Last 7 days',
    month: 'Last 30 days',
    comparedTo: { today: 'vs. yesterday', week: 'vs. previous week', month: 'vs. previous month' },
    calls: '{{count}} calls',
    tokens: '{{input}} tokens in / {{output}} out',
    kinds: { triage: 'Triage', draft: 'Draft', keyTest: 'Key test' },
    history: 'Cost over time',
    unit: { day: 'Day', month: 'Month', year: 'Year' },
    prices: { title: 'Prices', model: 'Model', input: 'In', output: 'Out' },
    loadError: 'The AI costs could not be loaded.',
    loading: 'Loading',
  },
};

function aWindow(overrides: Partial<AiUsageWindow> = {}): AiUsageWindow {
  const nothing = { calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 };
  return {
    calls: 3,
    inputTokens: 48210,
    outputTokens: 6120,
    costUsd: 0.05,
    previousCostUsd: 0.04,
    byKind: { triage: { ...nothing, calls: 2, costUsd: 0.01 }, draft: { ...nothing, calls: 1, costUsd: 0.04 }, keyTest: nothing },
    ...overrides,
  };
}

function aUsage(overrides: Partial<AiUsage> = {}): AiUsage {
  return {
    windows: {
      today: aWindow(),
      week: aWindow({ costUsd: 0.4, previousCostUsd: 0.4 }),
      month: aWindow({ costUsd: 1.5, previousCostUsd: 2 }),
    },
    daily: [
      { period: '2026-09-12', triageCostUsd: 0.01, draftCostUsd: 0.02, keyTestCostUsd: 0, calls: 2 },
      { period: '2026-09-13', triageCostUsd: 0.03, draftCostUsd: 0, keyTestCostUsd: 0.0001, calls: 3 },
    ],
    monthly: [
      { period: '2026-08', triageCostUsd: 0.4, draftCostUsd: 1.1, keyTestCostUsd: 0, calls: 60 },
      { period: '2026-09', triageCostUsd: 0.2, draftCostUsd: 0.5, keyTestCostUsd: 0.0001, calls: 30 },
    ],
    yearly: [{ period: '2026', triageCostUsd: 0.6, draftCostUsd: 1.6, keyTestCostUsd: 0.0001, calls: 90 }],
    prices: [{ model: 'claude-sonnet-5', inputPerMillion: 2, outputPerMillion: 10 }],
    unpricedCalls: 0,
    ...overrides,
  };
}

describe('AiCostsPage', () => {
  const value = signal<AiUsage | undefined>(undefined);
  const error = signal<unknown>(undefined);
  const status = signal<'loading' | 'reloading' | 'resolved'>('resolved');
  const isLoading = computed(() => status() !== 'resolved');
  const reload = vi.fn();

  beforeEach(async () => {
    value.set(undefined);
    error.set(undefined);
    status.set('resolved');
    reload.mockClear();
    await TestBed.configureTestingModule({
      imports: [
        AiCostsPage,
        TranslocoTestingModule.forRoot({
          langs: { en: translations },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
      providers: [
        provideZonelessChangeDetection(),
        { provide: AiUsageService, useValue: { usage: { value, error, status, isLoading, reload } } },
      ],
    }).compileComponents();
  });

  function createFixture() {
    const fixture = TestBed.createComponent(AiCostsPage);
    fixture.detectChanges();
    return fixture;
  }

  it('shows each stretch with its amount, its direction and what went in and out', () => {
    value.set(aUsage());
    const fixture = createFixture();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toMatch(/Today\s*\$0\.05/);
    expect(text).toMatch(/Last 7 days\s*\$0\.40/);
    expect(text).toMatch(/Last 30 days\s*\$1\.50/);
    // Up by a quarter against yesterday, flat against the week before, down against the month.
    expect(text).toContain('+25 %');
    expect(text).toContain('-25 %');
    // The triangle points the way; where the two stretches are equal there is no direction, no
    // colour, and no data-trend attribute at all.
    const icons = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('p-card i.pi')).map((icon) =>
      icon.className.includes('pi-caret-up') ? 'up' : icon.className.includes('pi-caret-down') ? 'down' : 'flat',
    );
    expect(icons).toEqual(['up', 'flat', 'down']);
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('[data-trend]')).toHaveLength(2);
    expect(text).toContain('3 calls');
    expect(text).toContain('48,210 tokens in / 6,120 out');
  });

  type ChartData = { labels: string[]; datasets: { label: string; data: number[] }[] };

  function chartData(fixture: ReturnType<typeof createFixture>): ChartData {
    return (fixture.debugElement.query(By.directive(UIChart)).componentInstance as UIChart).data() as ChartData;
  }

  it('hands the chart one bar per day, stacked by what the calls were for', () => {
    value.set(aUsage());
    const fixture = createFixture();

    const data = chartData(fixture);
    expect(data.labels).toEqual(['09/12', '09/13']);
    expect(data.datasets.map((dataset) => dataset.label)).toEqual(['Triage', 'Draft', 'Key test']);
    expect(data.datasets[0].data).toEqual([0.01, 0.03]);
    expect(data.datasets[2].data).toEqual([0, 0.0001]);
  });

  it('cuts the calendar by month or by year on request', () => {
    value.set(aUsage());
    const fixture = createFixture();
    const element = fixture.nativeElement as HTMLElement;
    const unit = (label: string) => element.querySelector<HTMLElement>(`p-togglebutton[aria-label="${label}"]`)!;
    expect(['Day', 'Month', 'Year'].map((label) => unit(label))).not.toContain(null);

    unit('Month').click();
    fixture.detectChanges();
    let data = chartData(fixture);
    expect(data.labels).toEqual(['Aug 2026', 'Sep 2026']);
    expect(data.datasets[1].data).toEqual([1.1, 0.5]);

    unit('Year').click();
    fixture.detectChanges();
    data = chartData(fixture);
    expect(data.labels).toEqual(['2026']);
    expect(data.datasets[0].data).toEqual([0.6]);
  });

  it('lists the prices the amounts rest on', () => {
    value.set(aUsage());
    const text = (createFixture().nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('claude-sonnet-5');
    expect(text).toMatch(/\$2\.00\s*\$10\.00/);
  });

  it('says when calls are missing from the sums, and only then', () => {
    value.set(aUsage());
    expect((createFixture().nativeElement as HTMLElement).textContent).not.toContain('no priced model');

    value.set(aUsage({ unpricedCalls: 4 }));
    expect((createFixture().nativeElement as HTMLElement).textContent).toContain('4 calls have no priced model.');
  });

  it('shows the load error instead of the numbers', () => {
    error.set(new Error('down'));
    const text = (createFixture().nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('The AI costs could not be loaded.');
    expect(text).not.toContain('Today');
  });

  it('asks for newer numbers on request', () => {
    value.set(aUsage());
    const fixture = createFixture();

    (fixture.nativeElement as HTMLElement).querySelector('button')?.click();

    expect(reload).toHaveBeenCalledOnce();
  });
});
