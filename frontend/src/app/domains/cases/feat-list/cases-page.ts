import { Component, inject } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';

import { CasesStore } from '../data/cases-store';
import { CaseList } from '../ui/case-list';

@Component({
  selector: 'app-cases-page',
  imports: [TranslocoDirective, CaseList],
  templateUrl: './cases-page.html',
})
export class CasesPage {
  protected readonly store = inject(CasesStore);
}
