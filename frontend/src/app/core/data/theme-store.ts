import { DOCUMENT } from '@angular/common';
import { effect, inject, InjectionToken, Service, signal } from '@angular/core';

const STORAGE_KEY = 'frontdesk-theme';

/**
 * The storage backing the theme choice. Injectable so tests can provide an
 * in-memory fake: depending on Node version and jsdom, neither the global nor
 * the jsdom window reliably offers a working localStorage in unit tests.
 */
export const THEME_STORAGE = new InjectionToken<Storage | null>('THEME_STORAGE', {
  providedIn: 'root',
  factory: () => inject(DOCUMENT).defaultView?.localStorage ?? null,
});

/**
 * Light/dark theme state. Applies the `.dark` class on <html>, which drives
 * both Tailwind's `dark:` variants (custom variant in styles.css) and the
 * PrimeNG theme (`darkModeSelector` in app.config.ts). An explicit choice is
 * persisted; first visits follow the system preference.
 */
@Service()
export class ThemeStore {
  private readonly document = inject(DOCUMENT);
  private readonly storage = inject(THEME_STORAGE);

  readonly isDark = signal(this.initialDark());

  constructor() {
    effect(() => {
      this.document.documentElement.classList.toggle('dark', this.isDark());
    });
  }

  toggle(): void {
    this.isDark.update((isDark) => !isDark);
    this.storage?.setItem(STORAGE_KEY, this.isDark() ? 'dark' : 'light');
  }

  private initialDark(): boolean {
    const stored = this.storage?.getItem(STORAGE_KEY) ?? null;
    if (stored !== null) {
      return stored === 'dark';
    }
    // jsdom (unit tests) has no matchMedia — default to light there.
    const window = this.document.defaultView;
    return window !== null && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
}
