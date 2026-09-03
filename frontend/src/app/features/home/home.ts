import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { DeliverableCard } from '../../shared/components/deliverable-card/deliverable-card';
import { DeliverablesService } from '../../core/api/deliverables.service';
import { CoursesService } from '../../core/api/courses.service';
import { Deliverable } from '../../core/models/deliverable.model';
import { Course } from '../../core/models/course.model';
import { ModalShell } from '../../shared/components/modal-shell/modal-shell';
import { DeliverableForm } from '../deliverables/deliverable-form/deliverable-form';
import { DeliverableEdit } from '../deliverables/deliverable-edit/deliverable-edit';
import { CourseForm } from '../courses/course-form/course-form';
import { CourseEdit } from '../courses/course-edit/course-edit';
import { CourseList } from '../courses/course-list/course-list';
import { AnalysisPanel } from '../analysis/analysis-panel/analysis-panel';
import { ClassroomImport } from '../classroom/classroom-import/classroom-import';
import { AuthService } from '../../core/api/auth.service';
import { ActivatedRoute, Router } from '@angular/router';

type Modal = 'course' | 'deliverable' | 'analysis' | 'classroom' | 'course-edit' | 'deliverable-edit' | null;

@Component({
  selector: 'app-home',
  imports: [
    DeliverableCard,
    ModalShell,
    DeliverableForm,
    DeliverableEdit,
    CourseForm,
    CourseEdit,
    CourseList,
    AnalysisPanel,
    ClassroomImport,
  ],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class Home implements OnInit {
  private deliverablesApi = inject(DeliverablesService);
  private coursesApi = inject(CoursesService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  auth = inject(AuthService);

  deliverables = signal<Deliverable[]>([]);
  pendingCount = computed(() => this.deliverables().filter((d) => !d.submitted_at).length);
  courses = signal<Course[]>([]);
  modal = signal<Modal>(null);
  /** entregable / materia que se está editando en su modal */
  editingDeliverable = signal<Deliverable | null>(null);
  editingCourse = signal<Course | null>(null);
  notice = signal<string | null>(null);

  ngOnInit(): void {
    this.reload();
    this.loadCourses();

    const flag = this.route.snapshot.queryParamMap.get('classroom');
    if (flag === 'connected') {
      this.auth.refresh();
    }
    if (flag) {
      this.router.navigate([], { queryParams: {}, replaceUrl: true });
    }
  }

  private loadCourses(): void {
    this.coursesApi.list().subscribe((c) => this.courses.set(c));
  }

  reload(): void {
    // Todos los entregables (no solo pendientes): la lista de abajo también
    // muestra entregados y calificados para poder editarlos.
    this.deliverablesApi.list().subscribe((list) =>
      this.deliverables.set(
        [...list].sort((a, b) => a.due_date.localeCompare(b.due_date)),
      ),
    );
  }

  markSubmitted(id: number): void {
    this.deliverablesApi
      .update(id, { submitted_at: new Date().toISOString() })
      .subscribe(() => this.reload());
  }

  removeDeliverable(id: number): void {
    if (!confirm('¿Eliminar este entregable?')) return;
    this.deliverablesApi.remove(id).subscribe(() => this.reload());
  }

  openDeliverableEdit(d: Deliverable): void {
    this.editingDeliverable.set(d);
    this.modal.set('deliverable-edit');
  }

  openCourseEdit(c: Course): void {
    this.editingCourse.set(c);
    this.modal.set('course-edit');
  }

  removeCourse(id: number): void {
    if (!confirm('¿Eliminar la materia y todos sus entregables?')) return;
    this.coursesApi.remove(id).subscribe(() => {
      this.loadCourses();
      this.reload();
    });
  }

  /** Un formulario de CREAR guardó: cerrar y refrescar. */
  onSaved(): void {
    this.modal.set(null);
    this.loadCourses();
    this.reload();
  }

  /** Un formulario de EDITAR guardó algo: refrescar SIN cerrar (el usuario
      puede seguir editando; el modal muestra su propia confirmación). */
  onEditedRefresh(): void {
    this.loadCourses();
    this.reload();
  }

  /** Se eliminó lo que se estaba editando: ya no hay nada, cerrar. */
  onDeleted(): void {
    this.modal.set(null);
    this.notice.set('Eliminado.');
    this.loadCourses();
    this.reload();
  }

  onImported(): void {
    this.modal.set(null);
    this.notice.set('Importación completa.');
    this.loadCourses();
    this.reload();
  }

  async logout(): Promise<void> {
    await this.auth.logout();
    this.router.navigate(['/login']);
  }
}
