import { HttpClient, httpResource } from '@angular/common/http';
import { inject, Service } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { User, UserCreate, UserUpdate } from '../model/user';

/** The wire shape: createdAt is an ISO string until it is parsed into a Date. */
type UserResponse = Omit<User, 'createdAt'> & { createdAt: string };

function toUser(response: UserResponse): User {
  return { ...response, createdAt: new Date(response.createdAt) };
}

@Service()
export class UsersService {
  private readonly http = inject(HttpClient);

  readonly users = httpResource<User[]>(() => '/api/users', {
    defaultValue: [],
    parse: (users) => (users as UserResponse[]).map(toUser),
  });

  /** Adds a user to the admin's own tenant; the reloaded list then holds them in sorted place. */
  async create(user: UserCreate): Promise<void> {
    await firstValueFrom(this.http.post<UserResponse>('/api/users', user));
    this.users.reload();
  }

  /** Saves and reloads, so a renamed user takes their new place in the sorted list. */
  async update(id: string, user: UserUpdate): Promise<void> {
    await firstValueFrom(this.http.put<UserResponse>(`/api/users/${id}`, user));
    this.users.reload();
  }

  /** Saves and reflects the server's answer in the loaded list, so the row shows the stored state. */
  async setActive(user: User, active: boolean): Promise<void> {
    const saved = toUser(await firstValueFrom(this.http.put<UserResponse>(`/api/users/${user.id}/active`, { active })));
    this.users.update((users) => users.map((existing) => (existing.id === saved.id ? saved : existing)));
  }
}
