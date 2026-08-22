import { Component, inject } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';

import { UserColumnsService } from '../data/user-columns-service';
import { UsersService } from '../data/users-service';
import { UserList } from '../ui/user-list';

/** All users of the signed-in admin's tenant, read-only for now. */
@Component({
  selector: 'app-users-page',
  imports: [TranslocoDirective, UserList],
  templateUrl: './users-page.html',
})
export class UsersPage {
  protected readonly usersService = inject(UsersService);
  protected readonly columnsService = inject(UserColumnsService);
}
