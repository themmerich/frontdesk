import { Routes } from '@angular/router';

export const companyRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('../feat-company/company-page').then((m) => m.CompanyPage),
  },
];
