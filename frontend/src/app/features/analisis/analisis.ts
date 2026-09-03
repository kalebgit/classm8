import { Component, inject, signal, computed, effect } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { VisorGauge } from '../../shared/components/visor-gauge/visor-gauge';
import { CourseAnalysis } from '../../core/models/analysis.model';
import { Course } from '../../core/models/course.model';
import { CoursesService } from '../../core/api/courses.service';
import { environment } from '../../../environments/environment';
import { DataBus } from '../../core/data-bus';
import {
  RoundingMethod,
  ROUNDING_LABEL,
  ROUNDING_NAME,
  toTen,
  roundTen,
  fmt2,
} from '../../shared/grade-scale';

/** una materia lista para mostrar: análisis + ajustes + números calculados */
interface Row {
  analysis: CourseAnalysis;
  course: Course; // trae extra_points / rounding_*
  base10: number; // current_grade a escala 0..10
  withExtra: number; // base10 + extra_points/10... no: extra son enteros sobre 10? -> ver nota
  final: number; // withExtra, redondeado si aplica
}

@Component({
  selector: 'app-analisis',
  imports: [FormsModule, VisorGauge],
  templateUrl: './analisis.html',
  styleUrl: './analisis.scss',
})
export class Analisis {
  private http = inject(HttpClient);
  private coursesApi = inject(CoursesService);
  private bus = inject(DataBus);

  readonly METHODS: RoundingMethod[] = ['trunc', 'ceil', 'half_up', 'half_up_strict'];
  readonly LABEL = ROUNDING_LABEL;
  readonly NAME = ROUNDING_NAME;
  readonly fmt2 = fmt2;

  private analyses = signal<CourseAnalysis[]>([]);
  private courses = signal<Course[]>([]);
  loaded = signal(false);
  expanded = signal<number | null>(null);

  constructor() {
    effect(() => {
      this.bus.version();
      this.reload();
    });
  }

  reload(): void {
    this.loaded.set(false);
    this.http.get<CourseAnalysis[]>(`${environment.apiUrl}/analysis`).subscribe((a) => {
      this.analyses.set(a);
      this.coursesApi.list().subscribe((c) => {
        this.courses.set(c);
        this.loaded.set(true);
      });
    });
  }

  /** materias con algo evaluado, ya con sus números en escala 0..10 */
  rows = computed<Row[]>(() => {
    const byId = new Map(this.courses().map((c) => [c.id, c]));
    return this.analyses()
      .filter((a) => a.evaluated_percentage > 0)
      .map((a) => {
        const course = byId.get(a.course_id)!;
        const base10 = toTen(a.current_grade); // 0..10, 2 dec
        // puntos extra: enteros 0..5 que se suman en DÉCIMOS a la calif sobre 10
        // (p. ej. 3 puntos extra -> +0.3). Así "puntos extra" no rompe la escala.
        const withExtra = Math.min(10, Math.round((base10 + (course?.extra_points ?? 0) / 10) * 100) / 100);
        const final = course?.rounding_enabled
          ? roundTen(withExtra, (course.rounding_method as RoundingMethod) ?? 'half_up')
          : withExtra;
        return { analysis: a, course, base10, withExtra, final };
      })
      .sort((x, y) => x.analysis.course_name.localeCompare(y.analysis.course_name));
  });

  pendingCourses = computed(() =>
    this.analyses().filter((a) => a.evaluated_percentage === 0),
  );

  /** promedio general: promedio SIMPLE de las calif FINALES (ya redondeadas) */
  globalAvg = computed(() => {
    const r = this.rows();
    if (r.length === 0) return null;
    const sum = r.reduce((s, x) => s + x.final, 0);
    return Math.round((sum / r.length) * 100) / 100;
  });

  // --- editar ajustes por materia ---
  private patch(courseId: number, body: Partial<Course>): void {
    this.coursesApi.update(courseId, body as never).subscribe(() => {
      // recargar solo la lista de materias (los análisis no cambian)
      this.coursesApi.list().subscribe((c) => this.courses.set(c));
    });
  }

  setExtra(row: Row, value: string): void {
    let n = Math.round(Number(value));
    if (Number.isNaN(n)) n = 0;
    n = Math.max(0, Math.min(5, n));
    this.patch(row.course.id, { extra_points: n });
  }
  toggleRounding(row: Row): void {
    this.patch(row.course.id, { rounding_enabled: !row.course.rounding_enabled });
  }
  setMethod(row: Row, method: string): void {
    this.patch(row.course.id, { rounding_method: method as RoundingMethod });
  }

  toggle(courseId: number): void {
    this.expanded.set(this.expanded() === courseId ? null : courseId);
  }
}
