import { Component, inject, input, output, signal, computed, OnInit } from '@angular/core';
import { ReactiveFormsModule, NonNullableFormBuilder, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { ClassroomService } from '../../../core/api/classroom.service';
import { CoursesService } from '../../../core/api/courses.service';
import { Course } from '../../../core/models/course.model';
import { Category } from '../../../core/models/category.model';
import { ScannedCourse, ScannedCoursework } from '../../../core/models/classroom.model';
import { StatusLine, Status } from '../../../shared/components/status-line/status-line';

type Step = 'loading' | 'disconnected' | 'courses' | 'coursework' | 'form' | 'done' | 'error';

@Component({
  selector: 'app-classroom-import',
  imports: [ReactiveFormsModule, DatePipe, StatusLine],
  templateUrl: './classroom-import.html',
  styleUrl: './classroom-import.scss',
})
export class ClassroomImport implements OnInit {
  private fb = inject(NonNullableFormBuilder);
  private classroom = inject(ClassroomService);
  private coursesApi = inject(CoursesService);

  /** Materias que ya tiene el usuario en classm8. */
  courses = input.required<Course[]>();
  /** Se importó al menos un entregable: el padre refresca. */
  imported = output<void>();

  step = signal<Step>('loading');
  status = signal<Status>(null);

  // paso 1: cursos de Classroom detectados (con entregables fechados)
  scanned = signal<ScannedCourse[]>([]);
  // paso 2: curso de Classroom elegido
  pickedCourse = signal<ScannedCourse | null>(null);
  // paso 3: entregable de Classroom elegido
  pickedWork = signal<ScannedCoursework | null>(null);

  // categorías de la materia de classm8 seleccionada en el form
  categories = signal<Category[]>([]);
  busy = signal(false);
  importedCount = signal(0);

  form = this.fb.group({
    name: ['', Validators.required], // editable, default = título de Classroom
    course_id: [0, Validators.min(1)], // materia de classm8
    category_id: [0, Validators.min(1)], // "tipo" de entregable
  });

  constructor() {
    // al elegir materia de classm8, cargar sus categorías (una sola suscripción)
    this.form.controls.course_id.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((id) => {
        this.form.controls.category_id.setValue(0);
        this.categories.set([]);
        if (id) this.coursesApi.categories(id).subscribe((c) => this.categories.set(c));
      });
  }

  ngOnInit(): void {
    this.classroom.scan().subscribe({
      next: (res) => {
        if (!res.connected) {
          this.step.set('disconnected');
          return;
        }
        this.scanned.set(res.courses);
        this.step.set('courses');
      },
      error: (err) => {
        if (err.status === 428) this.step.set('disconnected');
        else {
          this.status.set({ kind: 'error', text: err.error?.detail ?? 'No se pudo leer Classroom.' });
          this.step.set('error');
        }
      },
    });
  }

  // --- paso 1 -> 2 ---
  pickCourse(c: ScannedCourse): void {
    this.pickedCourse.set(c);
    this.step.set('coursework');
  }

  // --- paso 2 -> 3 ---
  pickWork(w: ScannedCoursework): void {
    if (w.already_imported) return;
    this.pickedWork.set(w);
    this.form.reset({ name: w.title, course_id: 0, category_id: 0 });
    this.categories.set([]);
    this.status.set(null);
    this.step.set('form');
  }

  // --- navegación atrás ---
  backToCourses(): void {
    this.pickedCourse.set(null);
    this.step.set('courses');
  }
  backToCoursework(): void {
    this.pickedWork.set(null);
    this.step.set('coursework');
  }

  // --- guardar el entregable ---
  save(): void {
    if (this.form.invalid) {
      this.status.set({ kind: 'error', text: 'Elige materia y tipo, y pon un nombre.' });
      return;
    }
    const w = this.pickedWork()!;
    const { name, course_id, category_id } = this.form.getRawValue();
    this.busy.set(true);
    this.classroom
      .import([
        {
          classroom_coursework_id: w.classroom_id,
          name: name.trim(),
          due_date: w.due_at, // FIJA, no editable
          course_id,
          new_course_name: null,
          category_id,
        },
      ])
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.importedCount.update((n) => n + 1);
          // marcar como importado en la lista y volver al paso 2
          w.already_imported = true;
          this.pickedWork.set(null);
          this.status.set({ kind: 'ok', text: `"${name}" importado.` });
          this.imported.emit();
          this.step.set('coursework');
        },
        error: (err) => {
          this.busy.set(false);
          this.status.set({ kind: 'error', text: err.error?.detail ?? 'No se pudo importar.' });
        },
      });
  }

  connect(): void {
    this.classroom.connect();
  }

  pendingInPicked = computed(
    () => this.pickedCourse()?.coursework.filter((w) => !w.already_imported).length ?? 0,
  );
}
