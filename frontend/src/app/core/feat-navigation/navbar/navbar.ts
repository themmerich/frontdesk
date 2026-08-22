import { Component, inject } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { AvatarModule } from 'primeng/avatar';
import { PopoverModule } from 'primeng/popover';
import { StyleClassModule } from 'primeng/styleclass';

import { AuthStore } from '../../data/auth-store';
import { PRESET_NAMES, ThemeService, TINTED_SURFACES } from '../../data/theme-service';

type Swatch = { name: string; color: string };

const PRIMARY_COLORS = [
  'emerald',
  'green',
  'lime',
  'red',
  'orange',
  'amber',
  'yellow',
  'teal',
  'cyan',
  'sky',
  'blue',
  'indigo',
  'violet',
  'purple',
  'fuchsia',
  'pink',
  'rose',
];
const SURFACE_COLORS = ['slate', 'gray', 'zinc', 'neutral', 'stone', 'soho', 'viva', 'ocean'];

function toSwatch(name: string): Swatch {
  // The presets emit every primitive palette as CSS variables, so the swatches
  // stay in sync with the active theme without resolving tokens ourselves.
  return { name, color: `var(--p-${name}-500)` };
}

function toSurfaceSwatch(name: string): Swatch {
  // Shade 700 separates the near-identical grays better than 500; the tinted
  // palettes are not part of the preset primitives, so their hex is used directly.
  return { name, color: TINTED_SURFACES[name]?.[700] ?? `var(--p-${name}-700)` };
}

/**
 * Topbar: hamburger that toggles the sidebar below `lg`, notification bell,
 * theme settings (palette popover), dark mode toggle, and the user avatar.
 */
@Component({
  selector: 'app-navbar',
  imports: [TranslocoDirective, AvatarModule, PopoverModule, StyleClassModule],
  templateUrl: './navbar.html',
  // Keeps the topbar div a direct child of the shell's content column.
  host: { class: 'contents' },
})
export class Navbar {
  protected readonly themeService = inject(ThemeService);
  protected readonly authStore = inject(AuthStore);

  protected readonly primarySwatches: Swatch[] = PRIMARY_COLORS.map(toSwatch);
  protected readonly surfaceSwatches: Swatch[] = SURFACE_COLORS.map(toSurfaceSwatch);
  protected readonly presets = PRESET_NAMES;

  protected onToggleTheme(): void {
    this.themeService.toggleDark();
  }
}
