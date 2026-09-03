import { Component, computed, input } from '@angular/core';

@Component({
  selector: 'app-pixel-gauge',
  templateUrl: './pixel-gauge.html',
  styleUrl: './pixel-gauge.scss',
})
export class PixelGauge {
  value = input.required<number>(); // 0..100

  label = computed(() => Math.round(this.value()));

  bars = computed(() => {
    const total = 11;
    const filled = (this.value() / 100) * total;
    return Array.from({ length: total }, (_, i) => ({
      y: i * 4,                    // 11 barras de 4 de alto → viewBox 44
      on: total - i <= filled,     // se encienden desde la de abajo
    }));
  });
}