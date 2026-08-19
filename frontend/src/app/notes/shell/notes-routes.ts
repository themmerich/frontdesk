import { Routes } from '@angular/router';

export const notesRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('../feature/notes-page').then((m) => m.NotesPage),
  },
];
