import { Component, inject, signal, computed, effect } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { PixelGauge } from '../../shared/components/pixel-gauge/pixel-gauge';
import { CourseAnalysis } from '../../core/models/analysis.model';
import { environment } from '../../../environments/environment';
import { DataBus } from '../../core/data-bus';

@Component({
  selector: 'app-analisis',
  imports: [PixelGauge],
  templateUrl: './analisis.html',
  styleUrl: './analisis.scss',
})
export class Analisis {
  private http = inject(HttpClient);
  private bus = inject(DataBus);

  all = signal<CourseAnalysis[]>([]);
  loaded = signal(false);
  /** materia expandida (muestra su desglose por criterio) */
  expanded = signal<number | null>(null);

  /** materias que ya tienen algo evaluado (entran al promedio global) */
  evaluated = computed(() => this.all().filter((c) => c.evaluated_percentage > 0));
  pendingEval = computed(() => this.all().filter((c) => c.evaluated_percentage === 0));

  /** promedio simple: cada materia con algo evaluado pesa igual */
  globalAvg = computed(() => {
    const ev = this.evaluated();
    if (ev.length === 0) return null;
    const sum = ev.reduce((s, c) => s + c.current_grade, 0);
    return Math.round((sum / ev.length) * 100) / 100;
  });

  constructor() {
    effect(() => {
      this.bus.version();
      this.reload();
    });
  }

  reload(): void {
    this.loaded.set(false);
    this.http
      .get<CourseAnalysis[]>(`${environment.apiUrl}/analysis`)
      .subscribe((data) => {
        this.all.set(data);
        this.loaded.set(true);
      });
  }

  toggle(courseId: number): void {
    this.expanded.set(this.expanded() === courseId ? null : courseId);
  }
}
