import { Routes } from '@angular/router';

export const casesRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('../feat-list/cases-page').then((m) => m.CasesPage),
  },
];
