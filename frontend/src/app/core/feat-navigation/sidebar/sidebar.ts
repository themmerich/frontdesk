import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { AvatarModule } from 'primeng/avatar';
import { StyleClassModule } from 'primeng/styleclass';

import { AuthStore } from '../../data/auth-store';

/**
 * Colored sidebar with the grouped navigation menu and the user footer. Hidden
 * below `lg`; the navbar's hamburger toggles it via its `#app-sidebar` id.
 */
@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive, TranslocoDirective, AvatarModule, StyleClassModule],
  templateUrl: './sidebar.html',
  // The host wraps the sidebar div; `contents` keeps that div a direct flex
  // child of the shell container, exactly as in the original one-piece layout.
  host: { class: 'contents' },
})
export class Sidebar {
  protected readonly authStore = inject(AuthStore);
  private readonly router = inject(Router);

  protected async onSignOut(): Promise<void> {
    await this.authStore.logout();
    await this.router.navigate(['/login']);
  }
}
