import { Routes } from '@angular/router';

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
    ],
  },
];
