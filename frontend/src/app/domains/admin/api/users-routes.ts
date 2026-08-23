import { Routes } from '@angular/router';

export const usersRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('../feat-users/users-page').then((m) => m.UsersPage),
  },
];
