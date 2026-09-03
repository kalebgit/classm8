import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login/login').then((m) => m.Login),
    title: 'Entrar',
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./features/shell/shell').then((m) => m.Shell),
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/pendientes/pendientes').then((m) => m.Pendientes),
        title: 'Pendientes',
      },
      {
        path: 'entregables',
        loadComponent: () =>
          import('./features/entregables/entregables').then((m) => m.Entregables),
        title: 'Entregables',
      },
      {
        path: 'materias',
        loadComponent: () =>
          import('./features/materias/materias').then((m) => m.Materias),
        title: 'Materias',
      },
      {
        path: 'analisis',
        loadComponent: () =>
          import('./features/analisis/analisis').then((m) => m.Analisis),
        title: 'Análisis',
      },
    ],
  },
];
