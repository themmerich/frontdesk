import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslocoTestingModule } from '@jsverse/transloco';

import { CaseEvent } from '../model/case';
import { CaseTimeline } from './case-timeline';

const translations = {
  cases: { tierAutomatic: 'Automatic', tierDraft: 'Draft', tierManual: 'Manual', tierInfo: 'Info', tierIgnore: 'Ignore' },
  caseDetail: {
    history: 'History',
    noCategory: 'Without a category',
    events: {
      ingested: 'Came in',
      triaged: 'Assessed: {{tier}}, {{confidence}}, {{categoryName}}',
      classification_corrected: 'Corrected: {{tier}}, {{categoryName}}',
      draft_generated: 'Draft written by the AI',
      draftGeneratedOnRequest: 'Draft written by the AI on request',
      draft_edited: 'Draft edited',
      handled: 'Done',
      reopened: 'Reopened',
      trashed: 'Moved to the trash',
      restored: 'Fetched back from the trash',
      sent: 'Reply sent to {{to}}',
    },
  },
};

function event(type: CaseEvent['type'], details: Record<string, unknown> = {}, actorName: string | null = null): CaseEvent {
  return { type, occurredAt: new Date('2026-08-19T08:30:00Z'), actorName, details };
}

describe('CaseTimeline', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [
        CaseTimeline,
        TranslocoTestingModule.forRoot({
          langs: { en: translations },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
  });

  function render(events: CaseEvent[]): HTMLElement {
    const fixture = TestBed.createComponent(CaseTimeline);
    fixture.componentRef.setInput('events', events);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  function entries(element: HTMLElement): { type: string | null; text: string; icon: string | undefined }[] {
    return Array.from(element.querySelectorAll('[data-event]')).map((entry) => ({
      type: entry.getAttribute('data-event'),
      text: entry.querySelector('span')?.textContent?.trim() ?? '',
      icon: entry.closest('.p-timeline-event')?.querySelector('i')?.className,
    }));
  }

  it('tells every step in a sentence, with what was written down about it filled in', () => {
    const element = render([
      event('ingested', { sender: 'kunde@example.com' }),
      event('triaged', { tier: 'draft', confidence: 0.88, categoryName: 'Rechnung' }),
      event('classification_corrected', { tier: 'manual' }, 'Anna Muster'),
      event('draft_generated', { onRequest: false }),
      event('draft_generated', { onRequest: true }, 'Anna Muster'),
      event('draft_edited', {}, 'Anna Muster'),
      event('sent', { to: 'kunde@example.com', subject: 'Re: Rechnung' }, 'Anna Muster'),
    ]);

    expect(entries(element).map((entry) => entry.text)).toEqual([
      'Came in',
      'Assessed: Draft, 88%, Rechnung',
      // No category named: said as such rather than left as a gap.
      'Corrected: Manual, Without a category',
      'Draft written by the AI',
      'Draft written by the AI on request',
      'Draft edited',
      'Reply sent to kunde@example.com',
    ]);
  });

  it('names who took a step and when, and marks each step with its own icon', () => {
    const element = render([
      event('ingested'),
      event('handled', {}, 'Anna Muster'),
      event('sent', { to: 'x@example.com' }, 'Ben Beispiel'),
    ]);

    const shown = entries(element);
    expect(shown.map((entry) => entry.icon)).toEqual(['text-xs! pi pi-inbox', 'text-xs! pi pi-check-circle', 'text-xs! pi pi-send']);
    const meta = Array.from(element.querySelectorAll('[data-event] span:last-child')).map((span) =>
      span.textContent?.replace(/\s+/g, ' ').trim(),
    );
    // Nobody stands behind the first step; the other two carry their names before the moment.
    expect(meta[0]).not.toContain('·');
    expect(meta[1]).toMatch(/^Anna Muster · /);
    expect(meta[2]).toMatch(/^Ben Beispiel · /);
  });
});
