import { CurrencyPipe, DecimalPipe, DOCUMENT } from '@angular/common';
import { Component, computed, DestroyRef, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { ChartModule } from 'primeng/chart';
import { MessageModule } from 'primeng/message';
import { SelectButtonModule } from 'primeng/selectbutton';
import { TableModule } from 'primeng/table';
import { ChartOptionsBase } from 'primeng/types/chart';

import { AiUsageService } from '../data/ai-usage-service';
import { AiUsageBucket, AiUsageKindName, AiUsageUnit, AiUsageWindowName } from '../model/ai-usage';

/** The three stretches the tiles show, in the order they stand. */
const WINDOW_NAMES: AiUsageWindowName[] = ['today', 'week', 'month'];

/** How the chart may cut the calendar, in the order the buttons stand. */
const UNITS: AiUsageUnit[] = ['day', 'month', 'year'];

/** What a call was for, and the token its bar is drawn in. */
const KIND_COLORS: Record<AiUsageKindName, string> = {
  triage: '--app-ai-triage',
  draft: '--app-ai-draft',
  keyTest: '--app-ai-key-test',
};

/**
 * What the tenant's AI calls cost. Built like the dashboard rather than like the form pages: the
 * numbers are read once when the page opens, from sums the server made, and stand still until
 * somebody asks for newer ones.
 */
@Component({
  selector: 'app-ai-costs-page',
  imports: [
    CurrencyPipe,
    DecimalPipe,
    FormsModule,
    TranslocoDirective,
    ButtonModule,
    CardModule,
    ChartModule,
    MessageModule,
    SelectButtonModule,
    TableModule,
  ],
  templateUrl: './ai-costs-page.html',
})
export class AiCostsPage {
  protected readonly aiUsageService = inject(AiUsageService);
  private readonly transloco = inject(TranslocoService);
  private readonly document = inject(DOCUMENT);

  /** Bumped whenever the theme changes, so the chart is rebuilt from the tokens that now apply. */
  private readonly theme = signal(0);

  // Re-evaluates the chart labels once the active translation file (re)loads.
  private readonly translation = toSignal(this.transloco.selectTranslation());

  /** Read through the guard: value() throws while the resource is in the error state. */
  private readonly usage = computed(() => (this.aiUsageService.usage.error() ? null : (this.aiUsageService.usage.value() ?? null)));

  protected readonly hasLoaded = computed(() => this.usage() !== null);

  /**
   * Each stretch against the equally long one before it, the way the dashboard tiles compare: a
   * triangle says which way it went, and where the two are equal there is no direction.
   */
  protected readonly windows = computed(() => {
    const usage = this.usage();
    if (!usage) {
      return [];
    }
    return WINDOW_NAMES.map((name) => {
      const window = usage.windows[name];
      const difference = window.costUsd - window.previousCostUsd;
      return {
        name,
        ...window,
        trend: difference === 0 ? null : difference > 0 ? 'up' : 'down',
        // Against nothing there is no percentage to give.
        percentage: window.previousCostUsd === 0 ? null : Math.round((difference / window.previousCostUsd) * 100),
      };
    });
  });

  protected readonly prices = computed(() => this.usage()?.prices ?? []);

  protected readonly unpricedCalls = computed(() => this.usage()?.unpricedCalls ?? 0);

  /** How fine the chart cuts the calendar: the last 30 days, the last 12 months, or every year. */
  protected readonly unit = signal<AiUsageUnit>('day');

  protected readonly unitOptions = computed(() => {
    this.translation();
    return UNITS.map((unit) => ({ value: unit, label: this.transloco.translate(`aiCosts.unit.${unit}`) }));
  });

  /** One bar per stretch of the calendar, stacked by what the calls were for. */
  protected readonly historyData = computed(() => {
    this.translation();
    const usage = this.usage();
    const unit = this.unit();
    const buckets: AiUsageBucket[] = usage ? { day: usage.daily, month: usage.monthly, year: usage.yearly }[unit] : [];
    const lang = this.transloco.getActiveLang();
    const kinds: { kind: AiUsageKindName; of: (bucket: AiUsageBucket) => number }[] = [
      { kind: 'triage', of: (bucket) => bucket.triageCostUsd },
      { kind: 'draft', of: (bucket) => bucket.draftCostUsd },
      { kind: 'keyTest', of: (bucket) => bucket.keyTestCostUsd },
    ];
    return {
      labels: buckets.map((bucket) => periodLabel(bucket.period, unit, lang)),
      datasets: kinds.map(({ kind, of }) => ({
        label: this.transloco.translate(`aiCosts.kinds.${kind}`),
        data: buckets.map(of),
        backgroundColor: this.color(KIND_COLORS[kind]),
      })),
    };
  });

  protected readonly barOptions = computed<ChartOptionsBase>(() => {
    const text = this.color('--app-chart-text');
    const grid = this.color('--app-chart-grid');
    return {
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { color: text } } },
      scales: {
        x: { stacked: true, ticks: { color: text }, grid: { display: false } },
        y: { stacked: true, beginAtZero: true, ticks: { color: text }, grid: { color: grid } },
      },
    };
  });

  constructor() {
    // The theme is a class on <html>, toggled elsewhere in the app; the chart is the one thing
    // here that has to hear about it.
    const observer = new MutationObserver(() => this.theme.update((value) => value + 1));
    observer.observe(this.document.documentElement, { attributeFilter: ['class'] });
    inject(DestroyRef).onDestroy(() => observer.disconnect());
  }

  /** The way to newer numbers without leaving the page. */
  protected onRefresh(): void {
    this.aiUsageService.usage.reload();
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
 * The stretch as a person reads it: "13.09." for a day, "Sep. 2026" for a month, the year as it
 * is. The ISO text is parsed as a local date so the zone cannot shift it onto the day before.
 */
function periodLabel(period: string, unit: AiUsageUnit, lang: string): string {
  switch (unit) {
    case 'day':
      return new Date(`${period}T00:00:00`).toLocaleDateString(lang, { day: '2-digit', month: '2-digit' });
    case 'month':
      return new Date(`${period}-01T00:00:00`).toLocaleDateString(lang, { month: 'short', year: 'numeric' });
    default:
      return period;
  }
}
