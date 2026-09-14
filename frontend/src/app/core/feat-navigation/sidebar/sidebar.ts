import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { AvatarModule } from 'primeng/avatar';
import { StyleClassModule } from 'primeng/styleclass';

import { CompanyService } from '../../../shared/data/company-service';
import { AuthStore } from '../../../shared/data/auth-store';
import { FrontdeskLogo } from '../../ui/frontdesk-logo';

/**
 * Colored sidebar with the grouped navigation menu and the user footer. Hidden
 * below `lg`; the navbar's hamburger toggles it via its `#app-sidebar` id.
 */
@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive, TranslocoDirective, AvatarModule, StyleClassModule, FrontdeskLogo],
  templateUrl: './sidebar.html',
  // The host wraps the sidebar div; `contents` keeps that div a direct flex
  // child of the shell container, exactly as in the original one-piece layout.
  host: { class: 'contents' },
})
export class Sidebar {
  protected readonly authStore = inject(AuthStore);
  protected readonly companyService = inject(CompanyService);
  private readonly router = inject(Router);

  /** A super-user leaves the tenant they had open; the store lets the brand follow. */
  protected async onCloseTenant(): Promise<void> {
    await this.authStore.closeTenant();
    await this.router.navigate(['/tenants']);
  }

  protected async onSignOut(): Promise<void> {
    await this.authStore.logout();
    await this.router.navigate(['/login']);
  }
}
