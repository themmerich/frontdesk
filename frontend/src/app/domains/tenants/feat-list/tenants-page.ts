import { Component } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';

/**
 * Where a super-user lands: the tenants. For now a heading and a sentence — the list with
 * create, edit, delete and open follows in the next step.
 */
@Component({
  selector: 'app-tenants-page',
  imports: [TranslocoDirective],
  templateUrl: './tenants-page.html',
})
export class TenantsPage {}
