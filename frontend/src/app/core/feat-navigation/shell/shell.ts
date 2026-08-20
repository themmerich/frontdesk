import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { Navbar } from '../navbar/navbar';
import { Sidebar } from '../sidebar/sidebar';

/**
 * App shell: arranges sidebar, navbar, and the routed content area. Adapted
 * from the PrimeNG Blocks "colored sidebar with grouped menu" layout.
 */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, Navbar, Sidebar],
  templateUrl: './shell.html',
})
export class Shell {}
