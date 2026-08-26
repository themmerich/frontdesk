import { Routes } from '@angular/router';

export const aiSettingsRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('../feat-ai-settings/ai-settings-page').then((m) => m.AiSettingsPage),
  },
];
