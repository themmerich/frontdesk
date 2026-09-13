import { Routes } from '@angular/router';

export const aiCostsRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('../feat-ai-costs/ai-costs-page').then((m) => m.AiCostsPage),
  },
];
