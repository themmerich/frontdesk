import { DatePipe } from '@angular/common';
import { Component, input } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { TableModule } from 'primeng/table';

import { Case } from '../model/case';
import { FileSizePipe } from './file-size-pipe';

@Component({
  selector: 'app-case-list',
  imports: [DatePipe, FileSizePipe, TranslocoDirective, TableModule],
  templateUrl: './case-list.html',
})
export class CaseList {
  readonly cases = input.required<Case[]>();
}
