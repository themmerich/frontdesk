import { Routes } from '@angular/router';

export const settingsRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('../feat-email-settings/settings-page').then((m) => m.SettingsPage),
  },
];
