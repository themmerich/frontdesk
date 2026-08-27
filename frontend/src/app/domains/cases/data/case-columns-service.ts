import { DOCUMENT } from '@angular/common';
import { effect, inject, InjectionToken, Service, signal } from '@angular/core';

import {
  CaseColumnField,
  CaseColumnWidths,
  defaultColumnPreferences,
  isDefaultColumnPreferences,
  parseColumnPreferences,
} from '../model/case-column';

const STORAGE_KEY = 'frontdesk-case-columns';

/**
 * The storage backing the column choice. Injectable so tests can provide an
 * in-memory fake: depending on Node version and jsdom, neither the global nor
 * the jsdom window reliably offers a working localStorage in unit tests.
 */
export const CASE_COLUMNS_STORAGE = new InjectionToken<Storage | null>('CASE_COLUMNS_STORAGE', {
  providedIn: 'root',
  factory: () => inject(DOCUMENT).defaultView?.localStorage ?? null,
});

/**
 * Column order, visibility and widths of the case table, persisted across visits. All three
 * signals are written directly by the column toggle and the resize handles (through two-way
 * bindings), so persistence hangs off an effect rather than off setter methods.
 */
@Service()
export class CaseColumnsService {
  private readonly storage = inject(CASE_COLUMNS_STORAGE);

  private readonly preferences = this.restore();

  readonly order = signal<CaseColumnField[]>(this.preferences.order);
  readonly visibleFields = signal<CaseColumnField[]>(this.preferences.visibleFields);
  readonly widths = signal<CaseColumnWidths>(this.preferences.widths);

  constructor() {
    // Also runs once on startup, which rewrites the restored value in its
    // normalized form and thereby cleans up drifted entries.
    effect(() => {
      const preferences = { order: this.order(), visibleFields: this.visibleFields(), widths: this.widths() };
      // Back at the defaults there is nothing to remember, and the entry goes rather than
      // being written again — which is what makes a reset of the table leave nothing behind.
      if (isDefaultColumnPreferences(preferences)) {
        this.storage?.removeItem(STORAGE_KEY);
        return;
      }
      this.storage?.setItem(STORAGE_KEY, JSON.stringify(preferences));
    });
  }

  private restore() {
    const stored = this.storage?.getItem(STORAGE_KEY) ?? null;
    if (stored === null) {
      return defaultColumnPreferences();
    }
    try {
      return parseColumnPreferences(JSON.parse(stored));
    } catch {
      return defaultColumnPreferences();
    }
  }
}
