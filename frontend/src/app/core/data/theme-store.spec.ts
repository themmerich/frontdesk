import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { ThemeStore } from './theme-store';

// Same access path as the ThemeStore: on Node 26+ CI runners the `window`
// global aliases globalThis, whose Node-provided localStorage stub is
// undefined — only the jsdom window behind document.defaultView works.
const storage = document.defaultView!.localStorage;

describe('ThemeStore', () => {
  beforeEach(() => {
    storage.removeItem('frontdesk-theme');
    document.documentElement.classList.remove('dark');
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
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
