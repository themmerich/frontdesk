import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject } from '@angular/core';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { MessageService } from 'primeng/api';

import { UserColumnsService } from '../data/user-columns-service';
import { UsersService } from '../data/users-service';
import { User } from '../model/user';
import { UserList } from '../ui/user-list';

/** All users of the signed-in admin's tenant; admins can activate and deactivate them. */
@Component({
  selector: 'app-users-page',
  imports: [TranslocoDirective, UserList],
  templateUrl: './users-page.html',
})
export class UsersPage {
  protected readonly usersService = inject(UsersService);
  protected readonly columnsService = inject(UserColumnsService);
  private readonly messageService = inject(MessageService);
  private readonly transloco = inject(TranslocoService);

  protected async onToggleActive(user: User): Promise<void> {
    try {
      await this.usersService.setActive(user, !user.active);
      this.toast('success', user.active ? 'users.deactivated' : 'users.activated');
    } catch (error) {
      // The backend answers 400 when an admin tries to deactivate themselves.
      const isSelfDeactivation = error instanceof HttpErrorResponse && error.status === 400;
      this.toast(isSelfDeactivation ? 'warn' : 'error', isSelfDeactivation ? 'users.selfDeactivate' : 'users.updateError');
    }
  }

  private toast(severity: 'success' | 'warn' | 'error', translationKey: string): void {
    this.messageService.add({ severity, summary: this.transloco.translate(translationKey) });
  }
}
