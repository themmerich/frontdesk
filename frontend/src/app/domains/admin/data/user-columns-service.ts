import { DOCUMENT } from '@angular/common';
import { effect, inject, InjectionToken, Service, signal } from '@angular/core';

import { UserColumnField, defaultColumnPreferences, parseColumnPreferences } from '../model/user-column';

// Bumped when the name column was split into surname and first name: the
// stored orders of that era would have appended both at the far end, burying
// the very columns the table now leads with.
const STORAGE_KEY = 'frontdesk-user-columns-v2';

/**
 * The storage backing the column choice. Injectable so tests can provide an
 * in-memory fake: depending on Node version and jsdom, neither the global nor
 * the jsdom window reliably offers a working localStorage in unit tests.
 */
export const USER_COLUMNS_STORAGE = new InjectionToken<Storage | null>('USER_COLUMNS_STORAGE', {
  providedIn: 'root',
  factory: () => inject(DOCUMENT).defaultView?.localStorage ?? null,
});

/**
 * Column order and visibility of the user table, persisted across visits. Both
 * signals are written directly by the column toggle (through two-way bindings),
 * so persistence hangs off an effect rather than off setter methods.
 */
@Service()
export class UserColumnsService {
  private readonly storage = inject(USER_COLUMNS_STORAGE);

  private readonly preferences = this.restore();

  readonly order = signal<UserColumnField[]>(this.preferences.order);
  readonly visibleFields = signal<UserColumnField[]>(this.preferences.visibleFields);

  constructor() {
    // Also runs once on startup, which rewrites the restored value in its
    // normalized form and thereby cleans up drifted entries.
    effect(() => {
      const preferences = { order: this.order(), visibleFields: this.visibleFields() };
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
