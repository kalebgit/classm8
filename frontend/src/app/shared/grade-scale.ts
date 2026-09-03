/**
 * Conversión y redondeo de calificaciones para la pestaña Análisis.
 * Todo opera en escala 0..10 con 2 decimales.
 */

export type RoundingMethod = 'trunc' | 'ceil' | 'half_up' | 'half_up_strict';

/** acrónimos cortos para mostrar en la fila de la materia */
export const ROUNDING_LABEL: Record<RoundingMethod, string> = {
  trunc: 'TRC', // truncar
  ceil: 'CEIL', // función techo
  half_up: 'STD≥', // ≥ .5 sube
  half_up_strict: 'STD>', // > .5 sube
};

export const ROUNDING_NAME: Record<RoundingMethod, string> = {
  trunc: 'Truncar (quita decimales)',
  ceil: 'Techo (siempre sube)',
  half_up: 'Estándar: .5 o más sube',
  half_up_strict: 'Estándar estricto: más de .5 sube',
};

/** 0..100 -> 0..10 con 2 decimales */
export function toTen(grade100: number): number {
  return Math.round((grade100 / 10) * 100) / 100;
}

/** redondea una calif en escala 0..10 a entero según el método */
export function roundTen(value: number, method: RoundingMethod): number {
  const frac = value - Math.floor(value);
  switch (method) {
    case 'trunc':
      return Math.floor(value);
    case 'ceil':
      return Math.ceil(value);
    case 'half_up':
      return frac >= 0.5 ? Math.ceil(value) : Math.floor(value);
    case 'half_up_strict':
      return frac > 0.5 ? Math.ceil(value) : Math.floor(value);
  }
}

/** deja un número con 2 decimales como string (sin ceros de más si son .00 -> "9") */
export function fmt2(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}
