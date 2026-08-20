import { Component } from '@angular/core';

import { Shell } from './core/feat-navigation/shell/shell';

@Component({
  selector: 'app-root',
  imports: [Shell],
  templateUrl: './app.html',
})
export class App {}
