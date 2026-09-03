import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../api/auth.service';

/** Protege rutas: si no hay sesión, redirige a /login. */
export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.loaded()) {
    await auth.refresh();
  }
  if (auth.user()) {
    return true;
  }
  return router.createUrlTree(['/login']);
};
