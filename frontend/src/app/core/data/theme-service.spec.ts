import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { THEME_STORAGE, ThemeService } from './theme-service';

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

function storedSettings(storage: Storage): Record<string, unknown> {
  return JSON.parse(storage.getItem('frontdesk-theme') ?? '{}') as Record<string, unknown>;
}

describe('ThemeService', () => {
  let storage: Storage;

  beforeEach(() => {
    storage = createFakeStorage();
    document.documentElement.classList.remove('dark');
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), { provide: THEME_STORAGE, useValue: storage }],
    });
  });

  it('starts with the defaults when nothing is stored', () => {
    const store = TestBed.inject(ThemeService);

    expect(store.isDark()).toBe(false);
    expect(store.preset()).toBe('aura');
    expect(store.primary()).toBeNull();
    expect(store.surface()).toBeNull();
  });

  it('restores stored settings', () => {
    storage.setItem('frontdesk-theme', JSON.stringify({ dark: true, preset: 'aura', primary: 'blue', surface: 'zinc' }));

    const store = TestBed.inject(ThemeService);

    expect(store.isDark()).toBe(true);
    expect(store.primary()).toBe('blue');
    expect(store.surface()).toBe('zinc');
  });

  it('understands the legacy dark/light string format', () => {
    storage.setItem('frontdesk-theme', 'dark');

    const store = TestBed.inject(ThemeService);

    expect(store.isDark()).toBe(true);
    expect(store.preset()).toBe('aura');
  });

  it('falls back to the defaults for unparseable stored values', () => {
    storage.setItem('frontdesk-theme', 'not json at all');

    const store = TestBed.inject(ThemeService);

    expect(store.isDark()).toBe(false);
    expect(store.preset()).toBe('aura');
  });

  it('toggles the dark class on <html> and persists the choice', () => {
    const store = TestBed.inject(ThemeService);

    store.toggleDark();
    TestBed.tick();

    expect(store.isDark()).toBe(true);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(storedSettings(storage)['dark']).toBe(true);

    store.toggleDark();
    TestBed.tick();

    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(storedSettings(storage)['dark']).toBe(false);
  });

  it('persists the chosen primary and surface palettes', () => {
    const store = TestBed.inject(ThemeService);

    store.setPrimary('blue');
    store.setSurface('zinc');

    expect(store.primary()).toBe('blue');
    expect(store.surface()).toBe('zinc');
    expect(storedSettings(storage)['primary']).toBe('blue');
    expect(storedSettings(storage)['surface']).toBe('zinc');
  });

  it('persists the chosen preset', () => {
    const store = TestBed.inject(ThemeService);

    store.setPreset('material');

    expect(store.preset()).toBe('material');
    expect(storedSettings(storage)['preset']).toBe('material');
  });
});
