import { Component, inject } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';

import { CaseColumnsService } from '../data/case-columns-service';
import { CasesService } from '../data/cases-service';
import { CaseList } from '../ui/case-list';

@Component({
  selector: 'app-cases-page',
  imports: [TranslocoDirective, CaseList],
  templateUrl: './cases-page.html',
})
export class CasesPage {
  protected readonly casesService = inject(CasesService);
  protected readonly columnsService = inject(CaseColumnsService);
}
