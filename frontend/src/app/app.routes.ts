import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadChildren: () => import('./cases/shell/cases-routes').then((m) => m.casesRoutes),
  },
];
