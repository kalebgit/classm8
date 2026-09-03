import { Component, computed, input } from '@angular/core';
import { gradeTone, TONE_COLOR } from '../../grade-color';

@Component({
  selector: 'app-pixel-gauge',
  templateUrl: './pixel-gauge.html',
  styleUrl: './pixel-gauge.scss',
})
export class PixelGauge {
  value = input.required<number>(); // 0..100+
  /** 'sm' | 'md' | 'lg' — controla el tamaño vía CSS var. */
  size = input<'sm' | 'md' | 'lg'>('md');

  label = computed(() => Math.round(this.value()));

  /** color del anillo, número y barras según el corte de calificación */
  color = computed(() => {
    const t = gradeTone(this.value());
    return t ? TONE_COLOR[t] : 'var(--amber)';
  });

  bars = computed(() => {
    const total = 11;
    // barras llenas: la calif se clampa a 100 para la parte visual del disco
    const filled = (Math.min(this.value(), 100) / 100) * total;
    return Array.from({ length: total }, (_, i) => ({
      y: i * 4,
      on: total - i <= filled,
    }));
  });
}
