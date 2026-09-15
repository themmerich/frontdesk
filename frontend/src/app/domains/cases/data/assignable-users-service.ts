import { httpResource } from '@angular/common/http';
import { Service } from '@angular/core';

import { AssignableUser } from '../model/case';

/**
 * The colleagues a case can be handed to: key and name, nothing else. Read by everyone who works
 * in the inbox, which is why it is its own read rather than a look into the administration's user
 * list — that one is closed to ordinary users and carries far more than a picker needs.
 */
@Service()
export class AssignableUsersService {
  readonly users = httpResource<AssignableUser[]>(() => '/api/users/assignable', { defaultValue: [] });
}
