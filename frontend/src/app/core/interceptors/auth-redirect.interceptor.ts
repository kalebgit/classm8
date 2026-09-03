import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

/**
 * Si el API responde 401 (sesión ausente o expirada), manda al usuario a /login.
 */
export const authRedirectInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  return next(req).pipe(
    catchError((err) => {
      if (err.status === 401) {
        router.navigate(['/login']);
      }
      return throwError(() => err);
    }),
  );
};
