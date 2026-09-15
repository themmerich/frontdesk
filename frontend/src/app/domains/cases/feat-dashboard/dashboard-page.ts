import { DOCUMENT } from '@angular/common';
import { Component, computed, DestroyRef, inject, linkedSignal, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { ChartModule } from 'primeng/chart';
import { SelectModule } from 'primeng/select';
import { SelectButtonModule } from 'primeng/selectbutton';
import { ChartOptionsBase } from 'primeng/types/chart';

import { CaseStatisticsService } from '../data/case-statistics-service';
import { CaseTier } from '../model/case';
import { ArrivalBucket, NO_CATEGORY, WindowName } from '../model/case-statistics';

/** How far back the arrivals chart looks, and in what steps it counts on the way. */
type Period = 'today' | 'week' | 'month' | 'year';

/** The three stretches the tiles compare with the stretch before them, in the order they stand. */
const WINDOW_NAMES: WindowName[] = ['today', 'week', 'month'];

/** How many days of the thirty the week shows: its last seven buckets are the same seven days. */
const WEEK_DAYS = 7;

/** What the arrivals chart may be narrowed to when it is narrowed to nothing. */
const EVERY_CATEGORY = 'all';

/** The tier a case sits on, and the label its bar carries — the same wording as in the inbox. */
const TIER_LABELS: Record<CaseTier | 'none', string> = {
  automatic: 'cases.tierAutomatic',
  draft: 'cases.tierDraft',
  manual: 'cases.tierManual',
  info: 'cases.tierInfo',
  ignore: 'cases.tierIgnore',
  none: 'dashboard.notTriaged',
};

/** The tier a case sits on, and the token its bar is drawn in. */
const TIER_COLORS: Record<CaseTier | 'none', string> = {
  automatic: '--app-tier-automatic',
  draft: '--app-tier-draft',
  manual: '--app-tier-manual',
  info: '--app-tier-info',
  ignore: '--app-tier-ignore',
  none: '--app-tier-none',
};

@Component({
  selector: 'app-dashboard-page',
  imports: [FormsModule, TranslocoDirective, ButtonModule, CardModule, ChartModule, SelectModule, SelectButtonModule],
  templateUrl: './dashboard-page.html',
})
export class DashboardPage {
  protected readonly statisticsService = inject(CaseStatisticsService);
  private readonly transloco = inject(TranslocoService);
  private readonly document = inject(DOCUMENT);

  /**
   * Bumped whenever the theme changes. A canvas keeps the colours it was drawn with, so the
   * charts are rebuilt from the tokens that now apply rather than staying in yesterday's light.
   */
  private readonly theme = signal(0);

  // Re-evaluates the labels once the active translation file (re)loads.
  private readonly translation = toSignal(this.transloco.selectTranslation());

  /** Read through the guard: value() throws while the resource is in the error state. */
  private readonly statistics = computed(() =>
    this.statisticsService.statistics.error() ? null : (this.statisticsService.statistics.value() ?? null),
  );

  constructor() {
    // The theme is a class on <html>, toggled elsewhere in the app; this is the one place that
    // needs to hear about it, so it listens here rather than reaching for the service that sets it.
    const observer = new MutationObserver(() => this.theme.update((value) => value + 1));
    observer.observe(this.document.documentElement, { attributeFilter: ['class'] });
    inject(DestroyRef).onDestroy(() => observer.disconnect());
  }

  /**
   * The way to newer numbers without leaving the page. The sums are read when the page opens and
   * then stand still: a chart redrawn behind somebody's back only flickers, and a day's worth of
   * cases does not change enough in ten seconds to be worth watching.
   */
  protected onRefresh(): void {
    this.statisticsService.statistics.reload();
  }

  /** Which stretch the arrivals chart shows, and how fine it counts within it. */
  protected readonly period = signal<Period>('month');

  protected readonly periodOptions = computed(() => {
    this.translation();
    return (['today', 'week', 'month', 'year'] as Period[]).map((period) => ({
      value: period,
      label: this.transloco.translate(`dashboard.period.${period}`),
    }));
  });

  /** What the inbox holds, what of it is still on someone's list, and where the rest went. */
  protected readonly totals = computed(() => this.statistics()?.totals ?? { all: 0, untriaged: 0, manual: 0, archived: 0, trashed: 0 });

  /**
   * What came in today, over the last seven days and over the last thirty — each against the
   * equally long stretch right before it, which is what "ggü. Vorwoche" is short for. A triangle
   * says which way it went, green for up and red for down; where the two are equal there is no
   * direction and no colour, only a dash.
   */
  protected readonly windows = computed(() => {
    const statistics = this.statistics();
    return WINDOW_NAMES.map((name) => {
      const { count, previous } = statistics?.windows[name] ?? { count: 0, previous: 0 };
      const difference = count - previous;
      return {
        name,
        count,
        difference,
        trend: difference === 0 ? null : difference > 0 ? 'up' : 'down',
        // Against nothing there is no percentage to give, only the number itself.
        percentage: previous === 0 ? null : Math.round(((count - previous) / previous) * 100),
      };
    });
  });

  protected readonly categoryData = computed(() => {
    this.translation();
    const counts = this.statistics()?.byCategory ?? [];
    return {
      labels: counts.map((count) => count.name ?? this.transloco.translate('dashboard.withoutCategory')),
      datasets: [
        {
          data: counts.map((count) => count.count),
          backgroundColor: counts.map((count) => this.color(count.color ? `--app-category-${count.color}` : '--app-tier-none')),
          borderWidth: 0,
        },
      ],
    };
  });

  protected readonly tierData = computed(() => {
    this.translation();
    const counts = this.statistics()?.byTier ?? [];
    return {
      labels: counts.map((count) => this.transloco.translate(TIER_LABELS[count.tier ?? 'none'])),
      datasets: [
        {
          data: counts.map((count) => count.count),
          backgroundColor: counts.map((count) => this.color(TIER_COLORS[count.tier ?? 'none'])),
          borderRadius: 4,
        },
      ],
    };
  });

  /**
   * The categories the arrivals chart can be narrowed to: the ones the cases at hand carry, in the
   * order the doughnut draws them, with everything in front and the uncategorised behind.
   */
  protected readonly categoryOptions = computed(() => {
    this.translation();
    const counts = this.statistics()?.byCategory ?? [];
    return [
      { value: EVERY_CATEGORY, label: this.transloco.translate('dashboard.everyCategory') },
      ...counts.flatMap((count) => (count.id === null ? [] : [{ value: count.id, label: count.name ?? count.id }])),
      ...(counts.some((count) => count.id === null)
        ? [{ value: NO_CATEGORY, label: this.transloco.translate('dashboard.withoutCategory') }]
        : []),
    ];
  });

  /**
   * Which category the arrivals chart is about. A fresh reading may no longer hold the one picked,
   * its last case filed away, say; then the chart goes back to showing everything rather than a
   * category the list no longer offers.
   */
  protected readonly arrivalCategory = linkedSignal<{ value: string }[], string>({
    source: this.categoryOptions,
    computation: (options, previous) =>
      previous !== undefined && options.some((option) => option.value === previous.value) ? previous.value : EVERY_CATEGORY,
  });

  /**
   * The buckets the arrivals chart draws. The week is the last seven of the thirty days — the
   * same seven buckets, so the server sends them once.
   */
  private readonly arrivalBuckets = computed<ArrivalBucket[]>(() => {
    const statistics = this.statistics();
    if (!statistics) {
      return [];
    }
    return {
      today: statistics.hours,
      week: statistics.days.slice(-WEEK_DAYS),
      month: statistics.days,
      year: statistics.months,
    }[this.period()];
  });

  protected readonly arrivalData = computed(() => {
    this.translation();
    const category = this.arrivalCategory();
    const buckets = this.arrivalBuckets();
    const format = this.bucketFormat();
    return {
      labels: buckets.map((bucket) => format.format(periodStart(bucket.period))),
      datasets: [
        {
          data: buckets.map((bucket) => (category === EVERY_CATEGORY ? bucket.count : (bucket.byCategory[category] ?? 0))),
          borderColor: this.color('--app-chart-line'),
          backgroundColor: this.color('--app-chart-line'),
          tension: 0.35,
          fill: false,
        },
      ],
    };
  });

  /** How a bucket is named, by how much of the calendar it covers. */
  private bucketFormat(): Intl.DateTimeFormat {
    const language = this.transloco.getActiveLang();
    return {
      today: () => new Intl.DateTimeFormat(language, { hour: '2-digit' }),
      week: () => new Intl.DateTimeFormat(language, { weekday: 'short', day: '2-digit' }),
      month: () => new Intl.DateTimeFormat(language, { day: '2-digit', month: '2-digit' }),
      year: () => new Intl.DateTimeFormat(language, { month: 'short' }),
    }[this.period()]();
  }

  /** No legend and no axes to speak of: the slices carry their own names. */
  protected readonly doughnutOptions = computed<ChartOptionsBase>(() => ({
    maintainAspectRatio: false,
    plugins: { legend: { position: 'right', labels: { color: this.color('--app-chart-text') } } },
  }));

  protected readonly barOptions = computed(() => this.axisOptions(false));
  protected readonly lineOptions = computed(() => this.axisOptions(true));

  /** Whole cases only: half a mail is not a tick on an axis. */
  private axisOptions(showGrid: boolean): ChartOptionsBase {
    const text = this.color('--app-chart-text');
    const grid = this.color('--app-chart-grid');
    return {
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: text }, grid: { display: showGrid, color: grid } },
        y: { beginAtZero: true, ticks: { color: text, precision: 0 }, grid: { color: grid } },
      },
    };
  }

  /**
   * The value behind a colour token. A canvas is painted, not styled, so the chart is handed what
   * the token resolves to at this moment — and is drawn again whenever the theme changes it.
   */
  private color(token: string): string {
    this.theme();
    return getComputedStyle(this.document.documentElement).getPropertyValue(token).trim();
  }
}

/**
 * When a bucket begins, from the ISO text the server cut it at. Parsed as a local date so the zone
 * cannot shift a bucket onto the hour or the day before — the server already cut the calendar
 * where the tenant's day ends.
 */
function periodStart(period: string): Date {
  // `2026-09` is a month, `2026-09-15` a day, `2026-09-15T14` an hour.
  if (period.length === 7) {
    return new Date(`${period}-01T00:00:00`);
  }
  return new Date(period.length === 10 ? `${period}T00:00:00` : `${period}:00:00`);
}
