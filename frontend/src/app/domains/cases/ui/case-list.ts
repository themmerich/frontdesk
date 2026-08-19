import { DatePipe } from '@angular/common';
import { Component, input } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { TableModule } from 'primeng/table';

import { Case } from '../model/case';

@Component({
  selector: 'app-case-list',
  imports: [DatePipe, TranslocoDirective, TableModule],
  template: `
    <ng-container *transloco="let t">
      <p-table [value]="cases()">
        <ng-template #header>
          <tr>
            <th scope="col">{{ t('cases.sender') }}</th>
            <th scope="col">{{ t('cases.subject') }}</th>
            <th scope="col">{{ t('cases.receivedAt') }}</th>
          </tr>
        </ng-template>
        <ng-template #body let-row>
          <tr>
            <td>{{ row.sender }}</td>
            <td>{{ row.subject }}</td>
            <td>{{ row.receivedAt | date: 'short' }}</td>
          </tr>
        </ng-template>
        <ng-template #emptymessage>
          <tr>
            <td colspan="3">{{ t('cases.empty') }}</td>
          </tr>
        </ng-template>
      </p-table>
    </ng-container>
  `,
})
export class CaseList {
  readonly cases = input.required<Case[]>();
}
