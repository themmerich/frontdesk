import { Component } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { AvatarModule } from 'primeng/avatar';
import { StyleClassModule } from 'primeng/styleclass';

/**
 * Topbar: hamburger that toggles the sidebar below `lg`, notification bell,
 * and the user avatar.
 */
@Component({
  selector: 'app-navbar',
  imports: [TranslocoDirective, AvatarModule, StyleClassModule],
  templateUrl: './navbar.html',
  // Keeps the topbar div a direct child of the shell's content column.
  host: { class: 'contents' },
})
export class Navbar {}
