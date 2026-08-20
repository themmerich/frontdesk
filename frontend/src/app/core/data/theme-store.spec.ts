import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { THEME_STORAGE, ThemeStore } from './theme-store';

// In-memory Storage fake: depending on Node version and jsdom, no real
// localStorage is reliably available in unit tests.
function createFakeStorage(): Storage {
  const entries = new Map<string, string>();
  return {
    get length() {
      return entries.size;
    },
    clear: () => entries.clear(),
    getItem: (key: string) => entries.get(key) ?? null,
    key: (index: number) => [...entries.keys()][index] ?? null,
    removeItem: (key: string) => {
      entries.delete(key);
    },
    setItem: (key: string, value: string) => {
      entries.set(key, value);
    },
  };
}

describe('ThemeStore', () => {
  let storage: Storage;

  beforeEach(() => {
    storage = createFakeStorage();
    document.documentElement.classList.remove('dark');
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), { provide: THEME_STORAGE, useValue: storage }],
    });
  });

  it('starts light when nothing is stored and no system preference is readable', () => {
    const store = TestBed.inject(ThemeStore);

    expect(store.isDark()).toBe(false);
  });

  it('starts dark when a dark choice was stored', () => {
    storage.setItem('frontdesk-theme', 'dark');

    const store = TestBed.inject(ThemeStore);

    expect(store.isDark()).toBe(true);
  });

  it('toggles the dark class on <html> and persists the choice', () => {
    const store = TestBed.inject(ThemeStore);

    store.toggle();
    TestBed.tick();

    expect(store.isDark()).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(storage.getItem('frontdesk-theme')).toBe('dark');

    store.toggle();
    TestBed.tick();

    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(storage.getItem('frontdesk-theme')).toBe('light');
  });
});
