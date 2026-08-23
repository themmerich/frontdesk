import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { palette, updatePrimaryPalette } from '@primeuix/themes';

import { CompanyService } from '../../shared/data/company-service';
import { THEME_STORAGE, ThemeService } from './theme-service';

// Mocked so the specs can assert which palettes get applied; the real runtime
// writes CSS variables, which jsdom cannot meaningfully verify.
vi.mock('@primeuix/themes', () => ({
  palette: vi.fn((value: unknown) => ({ paletteOf: value })),
  updatePrimaryPalette: vi.fn(),
  updateSurfacePalette: vi.fn(),
  usePreset: vi.fn(),
}));

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
  const companyColor = signal<string | null>(null);

  beforeEach(() => {
    storage = createFakeStorage();
    companyColor.set(null);
    vi.clearAllMocks();
    document.documentElement.classList.remove('dark');
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: THEME_STORAGE, useValue: storage },
        { provide: CompanyService, useValue: { primaryColor: companyColor } as unknown as CompanyService },
      ],
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

  it('applies the company color as the default primary once it loads', () => {
    TestBed.inject(ThemeService);
    TestBed.tick();
    expect(updatePrimaryPalette).not.toHaveBeenCalled();

    companyColor.set('#10b981');
    TestBed.tick();

    expect(palette).toHaveBeenCalledWith('#10b981');
    expect(updatePrimaryPalette).toHaveBeenCalledWith({ paletteOf: '#10b981' });
  });

  it('resetting the own primary falls back to the company color and persists', () => {
    storage.setItem('frontdesk-theme', JSON.stringify({ dark: false, preset: 'aura', primary: 'blue', surface: null }));
    companyColor.set('#10b981');
    const store = TestBed.inject(ThemeService);

    store.resetPrimary();

    expect(store.primary()).toBeNull();
    expect(storedSettings(storage)['primary']).toBeNull();
    expect(updatePrimaryPalette).toHaveBeenCalledWith({ paletteOf: '#10b981' });
  });

  it("never overrides the user's own primary choice with the company color", () => {
    storage.setItem('frontdesk-theme', JSON.stringify({ dark: false, preset: 'aura', primary: 'blue', surface: null }));
    TestBed.inject(ThemeService);

    companyColor.set('#10b981');
    TestBed.tick();

    expect(updatePrimaryPalette).not.toHaveBeenCalledWith({ paletteOf: '#10b981' });
    expect(updatePrimaryPalette).toHaveBeenCalledWith({ paletteOf: '{blue}' });
  });
});
