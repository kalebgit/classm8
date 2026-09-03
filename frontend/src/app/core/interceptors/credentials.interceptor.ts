import { HttpInterceptorFn } from '@angular/common/http';
import { environment } from '../../../environments/environment';

/**
 * Hace que el navegador adjunte la cookie de sesión (HttpOnly) en cada llamada
 * al API. Sin `withCredentials: true` la cookie NO se envía en peticiones
 * cross-origin.
 */
export const credentialsInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.url.startsWith(environment.apiUrl)) {
    req = req.clone({ withCredentials: true });
  }
  return next(req);
};
