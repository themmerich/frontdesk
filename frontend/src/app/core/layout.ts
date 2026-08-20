import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { AvatarModule } from 'primeng/avatar';
import { StyleClassModule } from 'primeng/styleclass';

/**
 * App shell: colored sidebar with grouped menu, topbar, and the routed content
 * area. Adapted from the PrimeNG Blocks "colored sidebar with grouped menu"
 * layout; the sidebar collapses behind the topbar hamburger below `lg`.
 */
@Component({
  selector: 'app-layout',
  imports: [RouterLink, RouterLinkActive, RouterOutlet, TranslocoDirective, AvatarModule, StyleClassModule],
  templateUrl: './layout.html',
})
export class Layout {}
