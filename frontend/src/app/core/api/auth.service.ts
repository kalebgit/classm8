import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface CurrentUser {
  id: number;
  email: string;
  name: string | null;
  picture: string | null;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/auth`;

  /** Usuario actual, o null si no hay sesión. */
  readonly user = signal<CurrentUser | null>(null);
  /** true una vez que se resolvió `refresh()` al menos una vez. */
  readonly loaded = signal(false);

  /**
   * Manda el navegador entero al backend, que arranca el flujo OAuth con Google.
   * NO es una llamada XHR: es una navegación de página completa.
   */
  loginWithGoogle(): void {
    window.location.href = `${this.base}/google/login`;
  }

  /** Pregunta al backend quién es el usuario de la cookie. */
  async refresh(): Promise<void> {
    try {
      const u = await firstValueFrom(
        this.http.get<CurrentUser>(`${this.base}/me`, { withCredentials: true }),
      );
      this.user.set(u);
    } catch {
      this.user.set(null);
    } finally {
      this.loaded.set(true);
    }
  }

  async logout(): Promise<void> {
    await firstValueFrom(
      this.http.post(`${this.base}/logout`, {}, { withCredentials: true }),
    );
    this.user.set(null);
  }
}
