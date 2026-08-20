import { Component, inject } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { AvatarModule } from 'primeng/avatar';
import { StyleClassModule } from 'primeng/styleclass';

import { ThemeStore } from '../../data/theme-store';

/**
 * Topbar: hamburger that toggles the sidebar below `lg`, notification bell,
 * dark mode toggle, and the user avatar.
 */
@Component({
  selector: 'app-navbar',
  imports: [TranslocoDirective, AvatarModule, StyleClassModule],
  templateUrl: './navbar.html',
  // Keeps the topbar div a direct child of the shell's content column.
  host: { class: 'contents' },
})
export class Navbar {
  protected readonly themeStore = inject(ThemeStore);

  protected onToggleTheme(): void {
    this.themeStore.toggle();
  }
}
