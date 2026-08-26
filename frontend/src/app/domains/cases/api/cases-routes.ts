import { Routes } from '@angular/router';

export const casesRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('../feat-list/cases-page').then((m) => m.CasesPage),
  },
  {
    // Spelled out rather than ':id': the domain is mounted at the app root, so a
    // bare parameter would swallow /settings, /users and every other sibling.
    path: 'cases/:id',
    loadComponent: () => import('../feat-detail/case-detail-page').then((m) => m.CaseDetailPage),
  },
];
