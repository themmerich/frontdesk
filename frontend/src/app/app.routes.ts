import { Routes } from '@angular/router';

import { adminGuard } from './core/admin-guard';
import { authGuard } from './core/auth-guard';
import { Shell } from './core/feat-navigation/shell/shell';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./core/feat-login/login-page').then((m) => m.LoginPage),
  },
  // The shell wraps every signed-in route; the guard resolves the session once
  // per app start and sends anonymous visitors to the login page.
  {
    path: '',
    component: Shell,
    canActivate: [authGuard],
    children: [
      {
        path: '',
        loadChildren: () => import('./domains/cases/api/cases-routes').then((m) => m.casesRoutes),
      },
      {
        path: 'settings',
        canActivate: [adminGuard],
        loadChildren: () => import('./domains/admin/api/settings-routes').then((m) => m.settingsRoutes),
      },
      {
        path: 'users',
        canActivate: [adminGuard],
        loadChildren: () => import('./domains/admin/api/users-routes').then((m) => m.usersRoutes),
      },
      {
        path: 'company',
        canActivate: [adminGuard],
        loadChildren: () => import('./domains/admin/api/company-routes').then((m) => m.companyRoutes),
      },
      {
        path: 'profile',
        loadComponent: () => import('./core/feat-profile/profile-page').then((m) => m.ProfilePage),
      },
    ],
  },
];
