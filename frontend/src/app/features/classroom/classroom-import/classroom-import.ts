import { Component, inject, input, output, signal, computed, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';
import { ClassroomService } from '../../../core/api/classroom.service';
import { CoursesService } from '../../../core/api/courses.service';
import { Course } from '../../../core/models/course.model';
import { Category } from '../../../core/models/category.model';
import { ScannedCourse, ImportItem } from '../../../core/models/classroom.model';

/** Estado editable de un coursework en el modal (lo que el usuario ajusta). */
interface Row {
  classroomId: string;
  name: string; // editable, default = título de Classroom
  dueDate: string; // fija (ISO), solo lectura
  alreadyImported: boolean;
  selected: boolean;
  categoryId: number; // solo aplica si el curso mapea a una materia existente
}

/** Estado editable de un curso escaneado: a qué materia de classm8 va. */
interface CourseMap {
  classroomId: string;
  classroomName: string;
  // 0 = crear materia nueva con `classroomName`; >0 = id de materia existente
  targetCourseId: number;
  rows: Row[];
}

@Component({
  selector: 'app-classroom-import',
  imports: [FormsModule, DatePipe],
  templateUrl: './classroom-import.html',
  styleUrl: './classroom-import.scss',
})
export class ClassroomImport implements OnInit {
  private classroom = inject(ClassroomService);
  private coursesApi = inject(CoursesService);

  /** Materias que ya tiene el usuario (para el mapeo). */
  courses = input.required<Course[]>();
  imported = output<void>();

  state = signal<'loading' | 'disconnected' | 'ready' | 'importing' | 'error'>('loading');
  errorMsg = signal('');
  maps = signal<CourseMap[]>([]);
  /** categorías por materia existente, cargadas bajo demanda */
  private categoriesByCourse = new Map<number, Category[]>();
  categoriesCache = signal(0); // bump para refrescar la vista al cargar categorías

  selectedCount = computed(() =>
    this.maps().reduce((n, m) => n + m.rows.filter((r) => r.selected && !r.alreadyImported).length, 0),
  );

  ngOnInit(): void {
    this.classroom.scan().subscribe({
      next: (res) => {
        if (!res.connected) {
          this.state.set('disconnected');
          return;
        }
        this.maps.set(res.courses.map((c) => this.toMap(c)));
        this.state.set('ready');
      },
      error: (err) => {
        // 428 = conectado pero el token murió -> tratar como desconectado
        if (err.status === 428) this.state.set('disconnected');
        else {
          this.errorMsg.set(err.error?.detail ?? 'No se pudo leer Classroom');
          this.state.set('error');
        }
      },
    });
  }

  private toMap(c: ScannedCourse): CourseMap {
    // Auto-mapea por nombre exacto (case-insensitive) si ya existe la materia.
    const match = this.courses().find(
      (x) => x.name.trim().toLowerCase() === c.name.trim().toLowerCase(),
    );
    const targetCourseId = match?.id ?? 0;
    if (targetCourseId) this.loadCategories(targetCourseId);
    return {
      classroomId: c.classroom_id,
      classroomName: c.name,
      targetCourseId,
      rows: c.coursework.map((w) => ({
        classroomId: w.classroom_id,
        name: w.title,
        dueDate: w.due_at,
        alreadyImported: w.already_imported,
        selected: !w.already_imported,
        categoryId: 0,
      })),
    };
  }

  onTargetChange(map: CourseMap): void {
    if (map.targetCourseId) this.loadCategories(map.targetCourseId);
    // al cambiar de materia, la categoría elegida deja de ser válida
    map.rows.forEach((r) => (r.categoryId = 0));
    this.maps.set([...this.maps()]);
  }

  private loadCategories(courseId: number): void {
    if (this.categoriesByCourse.has(courseId)) return;
    this.coursesApi.categories(courseId).subscribe((cats) => {
      this.categoriesByCourse.set(courseId, cats);
      this.categoriesCache.update((n) => n + 1);
    });
  }

  categoriesFor(courseId: number): Category[] {
    this.categoriesCache(); // dep para recomputar
    return this.categoriesByCourse.get(courseId) ?? [];
  }

  /** true si la fila necesita categoría y aún no la eligió. */
  needsCategory(map: CourseMap, row: Row): boolean {
    return row.selected && !row.alreadyImported && map.targetCourseId > 0 && row.categoryId === 0;
  }

  canImport = computed(() => {
    if (this.selectedCount() === 0) return false;
    return this.maps().every((m) =>
      m.rows.every((r) => !this.needsCategory(m, r)),
    );
  });

  connect(): void {
    this.classroom.connect();
  }

  submit(): void {
    if (!this.canImport()) return;
    const items: ImportItem[] = [];
    for (const m of this.maps()) {
      for (const r of m.rows) {
        if (!r.selected || r.alreadyImported) continue;
        items.push({
          classroom_coursework_id: r.classroomId,
          name: r.name.trim(),
          due_date: r.dueDate,
          course_id: m.targetCourseId > 0 ? m.targetCourseId : null,
          new_course_name: m.targetCourseId > 0 ? null : m.classroomName,
          category_id: m.targetCourseId > 0 ? r.categoryId : null,
        });
      }
    }
    this.state.set('importing');
    this.classroom.import(items).subscribe({
      next: () => this.imported.emit(),
      error: (err) => {
        this.errorMsg.set(err.error?.detail ?? 'La importación falló');
        this.state.set('error');
      },
    });
  }
}
