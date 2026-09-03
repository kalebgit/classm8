import { Injectable, signal } from '@angular/core';

/**
 * Puente entre el Shell (botones globales de crear materia/entregable) y las
 * secciones. Cuando algo cambia en el backend, el Shell llama `dataChanged()`
 * y cada sección que observe `version` recarga sus datos.
 */
@Injectable({ providedIn: 'root' })
export class DataBus {
  /** se incrementa en cada cambio; las secciones lo usan como dependencia */
  readonly version = signal(0);

  dataChanged(): void {
    this.version.update((v) => v + 1);
  }
}
