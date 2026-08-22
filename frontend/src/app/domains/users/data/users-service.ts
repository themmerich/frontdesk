import { httpResource } from '@angular/common/http';
import { Service } from '@angular/core';

import { User } from '../model/user';

@Service()
export class UsersService {
  readonly users = httpResource<User[]>(() => '/api/users', { defaultValue: [] });
}
