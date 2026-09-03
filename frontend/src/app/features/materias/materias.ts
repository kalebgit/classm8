import { Component, inject, signal, effect } from '@angular/core';
import { CourseList } from '../courses/course-list/course-list';
import { CourseEdit } from '../courses/course-edit/course-edit';
import { ModalShell } from '../../shared/components/modal-shell/modal-shell';
import { CoursesService } from '../../core/api/courses.service';
import { Course } from '../../core/models/course.model';
import { DataBus } from '../../core/data-bus';

@Component({
  selector: 'app-materias',
  imports: [CourseList, CourseEdit, ModalShell],
  templateUrl: './materias.html',
  styleUrl: './materias.scss',
})
export class Materias {
  private api = inject(CoursesService);
  private bus = inject(DataBus);

  courses = signal<Course[]>([]);
  editing = signal<Course | null>(null);

  constructor() {
    effect(() => {
      this.bus.version();
      this.reload();
    });
  }

  reload(): void {
    this.api.list().subscribe((c) => this.courses.set(c));
  }

  openEdit(c: Course): void {
    this.editing.set(c);
  }

  removeCourse(id: number): void {
    if (!confirm('¿Eliminar la materia y todos sus entregables?')) return;
    this.api.remove(id).subscribe(() => this.reload());
  }

  onEditDone(): void {
    this.editing.set(null);
    this.reload();
  }

  onEditedRefresh(): void {
    this.reload();
  }
}
