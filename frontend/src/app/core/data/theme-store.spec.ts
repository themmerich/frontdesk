import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { ThemeStore } from './theme-store';

describe('ThemeStore', () => {
  beforeEach(() => {
    window.localStorage.removeItem('frontdesk-theme');
    document.documentElement.classList.remove('dark');
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });

  it('starts light when nothing is stored and no system preference is readable', () => {
    const store = TestBed.inject(ThemeStore);

    expect(store.isDark()).toBe(false);
  });

  it('starts dark when a dark choice was stored', () => {
    window.localStorage.setItem('frontdesk-theme', 'dark');

    const store = TestBed.inject(ThemeStore);

    expect(store.isDark()).toBe(true);
  });

  it('toggles the dark class on <html> and persists the choice', () => {
    const store = TestBed.inject(ThemeStore);

    store.toggle();
    TestBed.tick();

    expect(store.isDark()).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(window.localStorage.getItem('frontdesk-theme')).toBe('dark');

    store.toggle();
    TestBed.tick();

    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(window.localStorage.getItem('frontdesk-theme')).toBe('light');
  });
});
