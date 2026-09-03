/**
 * Color según la calificación (0..100+). Se usa para el número de la calif en
 * las tarjetas y para los gauges de análisis.
 *
 *   < 60  -> coral   (reprobado)
 *   60-79 -> ámbar   (aprobado justo)
 *   80-100 -> verde  (bien)
 *   > 100 -> azul    (con puntos extra)
 */
export type GradeTone = 'low' | 'mid' | 'high' | 'bonus';

export function gradeTone(grade: number | null | undefined): GradeTone | null {
  if (grade == null) return null;
  if (grade > 100) return 'bonus';
  if (grade >= 80) return 'high';
  if (grade >= 60) return 'mid';
  return 'low';
}

/** Valor CSS del color para un tono (usa los tokens del sistema donde existe). */
export const TONE_COLOR: Record<GradeTone, string> = {
  low: 'var(--due)', // #ff6b47 coral
  mid: 'var(--amber)', // #ffb000 ámbar
  high: 'var(--ok)', // #5fbf6a verde
  bonus: '#5b9bff', // azul (nuevo)
};
