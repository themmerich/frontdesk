import { formatPercent } from '@angular/common';
import { DatePipe } from '@angular/common';
import { Component, computed, inject, input, LOCALE_ID } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { TimelineModule } from 'primeng/timeline';

import { CaseEvent, CaseEventType, CaseTier } from '../model/case';
import { TIER_LABEL_KEY } from './tier-tag';

/** One step of the trail as it is shown: what happened, in words, and the marker beside it. */
type TimelineEntry = {
  event: CaseEvent;
  icon: string;
  text: string;
};

/** The marker per step; a small closed set, so every one is spelled out. */
const ICONS: Record<CaseEventType, string> = {
  ingested: 'pi pi-inbox',
  triaged: 'pi pi-sparkles',
  classification_corrected: 'pi pi-pencil',
  draft_generated: 'pi pi-sparkles',
  draft_edited: 'pi pi-pencil',
  handled: 'pi pi-check-circle',
  reopened: 'pi pi-undo',
  trashed: 'pi pi-trash',
  restored: 'pi pi-replay',
  sent: 'pi pi-send',
};

/**
 * What a case has been through, oldest step first: came in, was judged, was corrected, was
 * answered. Each step in one sentence, with who took it and when. The details a step was written
 * down with are read here and nowhere else.
 */
@Component({
  selector: 'app-case-timeline',
  imports: [DatePipe, TranslocoDirective, TimelineModule],
  templateUrl: './case-timeline.html',
})
export class CaseTimeline {
  readonly events = input.required<CaseEvent[]>();

  private readonly transloco = inject(TranslocoService);
  private readonly locale = inject(LOCALE_ID);
  // Re-evaluates the sentences once the active translation file (re)loads.
  private readonly translation = toSignal(this.transloco.selectTranslation());

  protected readonly entries = computed<TimelineEntry[]>(() => {
    this.translation();
    return this.events().map((event) => ({ event, icon: ICONS[event.type], text: this.describe(event) }));
  });

  /** The step in one sentence, with what is worth knowing about it filled in. */
  private describe(event: CaseEvent): string {
    const details = event.details;
    switch (event.type) {
      case 'triaged':
      case 'classification_corrected':
        return this.transloco.translate(`caseDetail.events.${event.type}`, {
          tier: this.tierLabel(details['tier']),
          confidence: typeof details['confidence'] === 'number' ? formatPercent(details['confidence'], this.locale, '1.0-0') : '',
          categoryName:
            typeof details['categoryName'] === 'string' ? details['categoryName'] : this.transloco.translate('caseDetail.noCategory'),
        });
      case 'draft_generated':
        return this.transloco.translate(
          details['onRequest'] === true ? 'caseDetail.events.draftGeneratedOnRequest' : 'caseDetail.events.draft_generated',
        );
      case 'sent':
        return this.transloco.translate('caseDetail.events.sent', { to: typeof details['to'] === 'string' ? details['to'] : '' });
      default:
        return this.transloco.translate(`caseDetail.events.${event.type}`);
    }
  }

  /** The tier's word as the inbox uses it; a tier the details do not name stays empty. */
  private tierLabel(tier: unknown): string {
    return typeof tier === 'string' && tier in TIER_LABEL_KEY ? this.transloco.translate(TIER_LABEL_KEY[tier as CaseTier]) : '';
  }
}
