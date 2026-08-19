import { Routes } from '@angular/router';

export const casesRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('../feature/cases-page').then((m) => m.CasesPage),
  },
];
