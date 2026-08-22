import { Routes } from '@angular/router';

export const usersRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('../feat-list/users-page').then((m) => m.UsersPage),
  },
];
