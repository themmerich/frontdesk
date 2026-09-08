import { Routes } from '@angular/router';

export const casesRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('../feat-list/cases-page').then((m) => m.CasesPage),
  },
  {
    path: 'dashboard',
    loadComponent: () => import('../feat-dashboard/dashboard-page').then((m) => m.DashboardPage),
  },
  {
    // The same page over the other piles: everything somebody has taken note of, and everything
    // somebody threw away. The pile is bound straight to the page's input, as query parameters are.
    path: 'archive',
    data: { pile: 'archive' },
    loadComponent: () => import('../feat-list/cases-page').then((m) => m.CasesPage),
  },
  {
    path: 'trash',
    data: { pile: 'trash' },
    loadComponent: () => import('../feat-list/cases-page').then((m) => m.CasesPage),
  },
  {
    // One group of the review, named by category and tier in the query parameters: a page that
    // can be linked to and walked away from, unlike the dialog it is opened from.
    path: 'review',
    loadComponent: () => import('../feat-review/case-review-page').then((m) => m.CaseReviewPage),
  },
  {
    // Spelled out rather than ':id': the domain is mounted at the app root, so a
    // bare parameter would swallow /settings, /users and every other sibling.
    path: 'cases/:id',
    loadComponent: () => import('../feat-detail/case-detail-page').then((m) => m.CaseDetailPage),
  },
];
