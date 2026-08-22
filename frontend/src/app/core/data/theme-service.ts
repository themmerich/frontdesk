import { DOCUMENT } from '@angular/common';
import { effect, inject, InjectionToken, Service, signal } from '@angular/core';
import { palette, updatePrimaryPalette, updateSurfacePalette, usePreset } from '@primeuix/themes';

const STORAGE_KEY = 'frontdesk-theme';

export const PRESET_NAMES = ['aura', 'material', 'lara', 'nora'] as const;
export type PresetName = (typeof PRESET_NAMES)[number];

type PresetModule = { default: Parameters<typeof usePreset>[0] };

// Lazily loaded so only the chosen preset lands in the bundle (Aura ships with
// the app config as the default).
const PRESETS: Record<PresetName, () => Promise<PresetModule>> = {
  aura: () => import('@primeuix/themes/aura'),
  material: () => import('@primeuix/themes/material'),
  lara: () => import('@primeuix/themes/lara'),
  nora: () => import('@primeuix/themes/nora'),
};

type ThemeSettings = {
  dark: boolean;
  preset: PresetName;
  /** null = the preset's own default palette. */
  primary: string | null;
  surface: string | null;
};

/**
 * Tinted surface palettes from the PrimeNG showcase. The Tailwind grays
 * (slate…stone) barely differ from each other, especially in dark mode; these
 * make the surface choice clearly visible.
 */
export const TINTED_SURFACES: Record<string, Record<number, string>> = {
  soho: {
    0: '#ffffff',
    50: '#ececec',
    100: '#dedfdf',
    200: '#c4c4c6',
    300: '#adaeb0',
    400: '#97979b',
    500: '#7f8084',
    600: '#6a6b70',
    700: '#55565b',
    800: '#3f4046',
    900: '#2c2c34',
    950: '#16161d',
  },
  viva: {
    0: '#ffffff',
    50: '#f3f3f3',
    100: '#e7e7e8',
    200: '#cfd0d0',
    300: '#b7b8b9',
    400: '#9fa1a1',
    500: '#87898a',
    600: '#6e7173',
    700: '#565a5b',
    800: '#3e4244',
    900: '#262b2c',
    950: '#0e1315',
  },
  ocean: {
    0: '#ffffff',
    50: '#fbfcfc',
    100: '#f7f9f8',
    200: '#eff3f2',
    300: '#dadedd',
    400: '#b1b7b6',
    500: '#828787',
    600: '#5f7274',
    700: '#415b61',
    800: '#29444e',
    900: '#183240',
    950: '#0c1920',
  },
};

function surfacePalette(name: string): object {
  return TINTED_SURFACES[name] ?? palette(`{${name}}`);
}

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
 * Theme state: dark mode, PrimeNG preset, and primary/surface palettes. Dark
 * mode applies the `.dark` class on <html> (drives Tailwind's `dark:` variants
 * and the PrimeNG theme); palettes and preset go through the @primeuix/themes
 * runtime APIs. Every explicit choice is persisted as one JSON object; first
 * visits follow the system preference for dark mode and the preset defaults
 * for the palettes.
 */
@Service()
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly storage = inject(THEME_STORAGE);

  private readonly settings = this.initialSettings();

  readonly isDark = signal(this.settings.dark);
  readonly preset = signal<PresetName>(this.settings.preset);
  readonly primary = signal<string | null>(this.settings.primary);
  readonly surface = signal<string | null>(this.settings.surface);

  constructor() {
    effect(() => {
      this.document.documentElement.classList.toggle('dark', this.isDark());
    });
    if (this.settings.preset !== 'aura') {
      void this.applyPreset(this.settings.preset);
    } else {
      this.applyPalettes();
    }
  }

  toggleDark(): void {
    this.isDark.update((isDark) => !isDark);
    this.persist();
  }

  setPreset(name: PresetName): void {
    this.preset.set(name);
    this.persist();
    void this.applyPreset(name);
  }

  setPrimary(name: string): void {
    this.primary.set(name);
    this.persist();
    updatePrimaryPalette(palette(`{${name}}`));
  }

  setSurface(name: string): void {
    this.surface.set(name);
    this.persist();
    updateSurfacePalette(surfacePalette(name));
  }

  private async applyPreset(name: PresetName): Promise<void> {
    const preset = await PRESETS[name]();
    usePreset(preset.default);
    // usePreset resets the palettes to the preset's defaults.
    this.applyPalettes();
  }

  private applyPalettes(): void {
    const primary = this.primary();
    if (primary !== null) {
      updatePrimaryPalette(palette(`{${primary}}`));
    }
    const surface = this.surface();
    if (surface !== null) {
      updateSurfacePalette(surfacePalette(surface));
    }
  }

  private persist(): void {
    const settings: ThemeSettings = {
      dark: this.isDark(),
      preset: this.preset(),
      primary: this.primary(),
      surface: this.surface(),
    };
    this.storage?.setItem(STORAGE_KEY, JSON.stringify(settings));
  }

  private initialSettings(): ThemeSettings {
    const defaults: ThemeSettings = { dark: this.systemPrefersDark(), preset: 'aura', primary: null, surface: null };
    const stored = this.storage?.getItem(STORAGE_KEY) ?? null;
    if (stored === null) {
      return defaults;
    }
    // Legacy format from before the palette settings: plain 'dark' / 'light'.
    if (stored === 'dark' || stored === 'light') {
      return { ...defaults, dark: stored === 'dark' };
    }
    try {
      const parsed = JSON.parse(stored) as Partial<ThemeSettings>;
      return {
        dark: typeof parsed.dark === 'boolean' ? parsed.dark : defaults.dark,
        preset: PRESET_NAMES.includes(parsed.preset as PresetName) ? (parsed.preset as PresetName) : defaults.preset,
        primary: typeof parsed.primary === 'string' ? parsed.primary : null,
        surface: typeof parsed.surface === 'string' ? parsed.surface : null,
      };
    } catch {
      return defaults;
    }
  }

  private systemPrefersDark(): boolean {
    // jsdom (unit tests) has no matchMedia — default to light there.
    const window = this.document.defaultView;
    return window !== null && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
}
