import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';

import { Navbar } from '../navbar/navbar';
import { Sidebar } from '../sidebar/sidebar';

/**
 * App shell: arranges sidebar, navbar, and the routed content area. Adapted
 * from the PrimeNG Blocks "colored sidebar with grouped menu" layout. Also
 * hosts the app-wide toast and confirmation outlets, fed through the
 * MessageService and the ConfirmationService.
 */
@Component({
  selector: 'app-shell',
  imports: [ConfirmDialogModule, RouterOutlet, ToastModule, Navbar, Sidebar],
  templateUrl: './shell.html',
})
export class Shell {}
