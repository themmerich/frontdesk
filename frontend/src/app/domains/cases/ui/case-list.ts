import { DatePipe } from '@angular/common';
import { Component, input } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { TableModule } from 'primeng/table';

import { Case } from '../model/case';

@Component({
  selector: 'app-case-list',
  imports: [DatePipe, TranslocoDirective, TableModule],
  templateUrl: './case-list.html',
})
export class CaseList {
  readonly cases = input.required<Case[]>();
}
