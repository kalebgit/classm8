import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ImportItem, ImportResult, ScanResult } from '../models/classroom.model';

@Injectable({ providedIn: 'root' })
export class ClassroomService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/classroom`;

  /**
   * Navegación de página completa al consentimiento de Google (scopes de
   * Classroom). Vuelve a `/?classroom=connected|error`.
   */
  connect(): void {
    window.location.href = `${this.base}/connect`;
  }

  /** Árbol cursos/coursework de Classroom para el modal de importar. */
  scan(): Observable<ScanResult> {
    return this.http.get<ScanResult>(`${this.base}/scan`);
  }

  /** Crea materias/entregables según el mapeo que resolvió el usuario. */
  import(items: ImportItem[]): Observable<ImportResult> {
    return this.http.post<ImportResult>(`${this.base}/import`, { items });
  }

  disconnect(): Observable<void> {
    return this.http.delete<void>(`${this.base}/connection`);
  }
}
