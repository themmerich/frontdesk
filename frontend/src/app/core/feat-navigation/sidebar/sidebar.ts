import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { AvatarModule } from 'primeng/avatar';
import { StyleClassModule } from 'primeng/styleclass';

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
export class Sidebar {}
