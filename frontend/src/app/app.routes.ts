import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadChildren: () => import('./domains/cases/api/cases-routes').then((m) => m.casesRoutes),
  },
];
