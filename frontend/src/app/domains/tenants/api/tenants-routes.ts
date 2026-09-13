import { Routes } from '@angular/router';

export const tenantsRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('../feat-list/tenants-page').then((m) => m.TenantsPage),
  },
];
