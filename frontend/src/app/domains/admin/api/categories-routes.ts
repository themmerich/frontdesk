import { Routes } from '@angular/router';

export const categoriesRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('../feat-categories/categories-page').then((m) => m.CategoriesPage),
  },
];
