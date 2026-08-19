import { Routes } from '@angular/router';

export const routes: Routes = [
  // Placeholder start page from the template: smoke-tests the PrimeNG +
  // Transloco + Tailwind wiring. Replaced by the case board once the first
  // real feature slice lands (see ROADMAP.md).
  {
    path: '',
    loadComponent: () => import('./demo/feature/primeng-test/primeng-test').then((m) => m.PrimeNgTest),
  },
];
