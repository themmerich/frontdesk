import { DOCUMENT } from '@angular/common';
import { Component, computed, DestroyRef, effect, inject, Injector, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { ChartModule } from 'primeng/chart';
import { SelectButtonModule } from 'primeng/selectbutton';
import { ChartOptionsBase } from 'primeng/types/chart';

import { CasesService } from '../data/cases-service';
import { Case, CaseTier } from '../model/case';
import { countByCategory, countByDay, countByHour, countByMonth, countByTier, countInWindow } from '../model/case-statistics';

/** How far back the arrivals chart looks, and in what steps it counts on the way. */
type Period = 'today' | 'week' | 'month' | 'year';

/** The three stretches the tiles compare with the stretch before them. */
const WINDOW_DAYS = { today: 1, week: 7, month: 30 } as const;

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
  imports: [FormsModule, TranslocoDirective, ButtonModule, CardModule, ChartModule, SelectButtonModule],
  templateUrl: './dashboard-page.html',
})
export class DashboardPage {
  protected readonly casesService = inject(CasesService);
  private readonly transloco = inject(TranslocoService);
  private readonly document = inject(DOCUMENT);
  private readonly injector = inject(Injector);

  /**
   * Bumped whenever the theme changes. A canvas keeps the colours it was drawn with, so the
   * charts are rebuilt from the tokens that now apply rather than staying in yesterday's light.
   */
  private readonly theme = signal(0);

  // Re-evaluates the labels once the active translation file (re)loads.
  private readonly translation = toSignal(this.transloco.selectTranslation());

  /**
   * What the page was opened on. The list behind it keeps itself current for the inbox, ten
   * seconds at a time — but a chart redrawn every ten seconds only flickers, and a day's worth of
   * cases does not change enough in that time to be worth watching. So the dashboard asks once,
   * when it opens, and then stands still until it is opened again.
   */
  private readonly cases = signal<Case[]>([]);

  constructor() {
    // The theme is a class on <html>, toggled elsewhere in the app; this is the one place that
    // needs to hear about it, so it listens here rather than reaching for the service that sets it.
    const observer = new MutationObserver(() => this.theme.update((value) => value + 1));
    observer.observe(this.document.documentElement, { attributeFilter: ['class'] });
    inject(DestroyRef).onDestroy(() => observer.disconnect());

    // Fresh numbers for this visit rather than whatever the last poll left behind.
    this.read();
  }

  /** The way to newer numbers without leaving the page, for whoever wants them now. */
  protected onRefresh(): void {
    this.read();
  }

  /**
   * One reading: the list is asked to load again and the first settled answer is kept. The effect
   * ends itself with that answer — a poll behind the page takes the list from reloading back to
   * resolved, and an effect left standing would read along with every one of them.
   */
  private read(): void {
    this.casesService.cases.reload();
    const reading = effect(
      () => {
        if (this.casesService.cases.status() === 'resolved') {
          untracked(() => this.cases.set(this.casesService.cases.value()));
          reading.destroy();
        }
      },
      { injector: this.injector },
    );
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

  /** What the inbox holds, and what of it is still on someone's list. */
  protected readonly totals = computed(() => {
    const cases = this.cases();
    return {
      all: cases.length,
      untriaged: cases.filter((aCase) => aCase.tier === null).length,
      manual: cases.filter((aCase) => aCase.tier === 'manual' || aCase.tier === 'draft').length,
    };
  });

  /**
   * What came in today, over the last seven days and over the last thirty — each against the
   * equally long stretch right before it, which is what "ggü. Vorwoche" is short for. The arrow
   * says which way it went; it is not coloured, because more mail is neither good nor bad news,
   * only more.
   */
  protected readonly windows = computed(() => {
    const cases = this.cases();
    const now = new Date();
    return Object.entries(WINDOW_DAYS).map(([name, days]) => {
      const { count, previous } = countInWindow(cases, days, now);
      return {
        name,
        count,
        difference: count - previous,
        // Against nothing there is no percentage to give, only the number itself.
        percentage: previous === 0 ? null : Math.round(((count - previous) / previous) * 100),
      };
    });
  });

  protected readonly categoryData = computed(() => {
    this.translation();
    const counts = countByCategory(this.cases());
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
    const counts = countByTier(this.cases());
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

  protected readonly arrivalData = computed(() => {
    this.translation();
    const now = new Date();
    const cases = this.cases();
    const language = this.transloco.getActiveLang();
    const { counts, format } = {
      today: () => ({ counts: countByHour(cases, now), format: new Intl.DateTimeFormat(language, { hour: '2-digit' }) }),
      week: () => ({ counts: countByDay(cases, 7, now), format: new Intl.DateTimeFormat(language, { weekday: 'short', day: '2-digit' }) }),
      month: () => ({
        counts: countByDay(cases, 30, now),
        format: new Intl.DateTimeFormat(language, { day: '2-digit', month: '2-digit' }),
      }),
      year: () => ({ counts: countByMonth(cases, 12, now), format: new Intl.DateTimeFormat(language, { month: 'short' }) }),
    }[this.period()]();
    return {
      labels: counts.map((count) => format.format(count.start)),
      datasets: [
        {
          data: counts.map((count) => count.count),
          borderColor: this.color('--app-chart-line'),
          backgroundColor: this.color('--app-chart-line'),
          tension: 0.35,
          fill: false,
        },
      ],
    };
  });

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
