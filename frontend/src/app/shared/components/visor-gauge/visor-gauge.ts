import { Component, computed, input, signal, effect } from '@angular/core';
import { gradeTone, TONE_COLOR } from '../../grade-color';

/**
 * "Visor de buzo": una ventana circular con remaches que se va llenando de
 * líquido de abajo hacia arriba, hasta la proporción de la calificación.
 * El nivel se anima al montar / al cambiar `value`.
 *
 * `value` está en escala 0..10 (el número que se muestra). `pct` controla el
 * llenado (0..100); si no se pasa, se deriva de value*10.
 */
@Component({
  selector: 'app-visor-gauge',
  templateUrl: './visor-gauge.html',
  styleUrl: './visor-gauge.scss',
})
export class VisorGauge {
  /** número grande dentro del visor (0..10, 2 decimales) */
  value = input.required<number>();
  /** relleno 0..100; por defecto value*10 clampeado */
  pct = input<number | null>(null);
  size = input<'sm' | 'md' | 'lg'>('md');

  /** nivel actual animado (0..100) */
  level = signal(0);

  private target = computed(() => {
    const p = this.pct() ?? this.value() * 10;
    return Math.max(0, Math.min(100, p));
  });

  color = computed(() => {
    // el corte usa la escala 0..100, así que multiplicamos
    const t = gradeTone(this.value() * 10);
    return t ? TONE_COLOR[t] : 'var(--amber)';
  });

  /** y del nivel de líquido dentro del viewBox 0..44 (invertido: 0 arriba) */
  levelY = computed(() => 44 - (this.level() / 100) * 44);

  label = computed(() => {
    const v = this.value();
    return Number.isInteger(v) ? String(v) : v.toFixed(2);
  });

  /** cos/sin en grados, para colocar los remaches del marco */
  cos(deg: number): number {
    return Math.cos((deg * Math.PI) / 180);
  }
  sin(deg: number): number {
    return Math.sin((deg * Math.PI) / 180);
  }

  constructor() {
    // anima el nivel hacia el objetivo cada vez que cambia
    effect((onCleanup) => {
      const goal = this.target();
      const start = this.level();
      const t0 = performance.now();
      const dur = 700;
      let raf = 0;
      const tick = (now: number) => {
        const k = Math.min(1, (now - t0) / dur);
        // easeOutCubic
        const e = 1 - Math.pow(1 - k, 3);
        this.level.set(start + (goal - start) * e);
        if (k < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      onCleanup(() => cancelAnimationFrame(raf));
    });
  }
}
