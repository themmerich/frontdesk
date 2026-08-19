import { Routes } from '@angular/router';

export const routes: Routes = [
  // Demo route: smoke-tests the PrimeNG + Transloco + Tailwind wiring and the
  // Sheriff module structure (src/app/<scope>/<type>, see sheriff.config.ts).
  // When starting a real app from this template, delete the demo scope,
  // this route, and its keys in public/i18n/*.json.
  {
    path: '',
    loadComponent: () => import('./demo/feature/primeng-test/primeng-test').then((m) => m.PrimeNgTest),
  },
  // Vertical slice: notes CRUD backed by the Spring Boot `/api/notes` API
  // (dev-server proxy in proxy.conf.json). Exercises the Sheriff categories
  // domain / data-access / ui / feature / shell in the `notes` scope.
  {
    path: 'notes',
    loadChildren: () => import('./notes/shell/notes-routes').then((m) => m.notesRoutes),
  },
];
