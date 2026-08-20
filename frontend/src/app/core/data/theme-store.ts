import { DOCUMENT } from '@angular/common';
import { effect, inject, Service, signal } from '@angular/core';

const STORAGE_KEY = 'frontdesk-theme';

/**
 * Light/dark theme state. Applies the `.dark` class on <html>, which drives
 * both Tailwind's `dark:` variants (custom variant in styles.css) and the
 * PrimeNG theme (`darkModeSelector` in app.config.ts). An explicit choice is
 * persisted; first visits follow the system preference.
 */
@Service()
export class ThemeStore {
  private readonly document = inject(DOCUMENT);
  // Via the document's window, not the global: on Node 26+ the bare
  // `localStorage` global shadows jsdom's working implementation in tests.
  private readonly storage = this.document.defaultView?.localStorage;

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
