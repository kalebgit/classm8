import { Component, inject, signal, OnInit } from '@angular/core';
import { DeliverableCard } from '../../shared/components/deliverable-card/deliverable-card';
import { DeliverablesService } from '../../core/api/deliverables.service';
import { CoursesService } from '../../core/api/courses.service';
import { Deliverable } from '../../core/models/deliverable.model';
import { Course } from '../../core/models/course.model';
import { ModalShell } from '../../shared/components/modal-shell/modal-shell';
import { DeliverableForm } from '../deliverables/deliverable-form/deliverable-form';
import { CourseForm } from '../courses/course-form/course-form';
import { AnalysisPanel } from '../analysis/analysis-panel/analysis-panel';
import { ClassroomImport } from '../classroom/classroom-import/classroom-import';
import { AuthService } from '../../core/api/auth.service';
import { ActivatedRoute, Router } from '@angular/router';

type Modal = 'course' | 'deliverable' | 'analysis' | 'classroom' | null;

@Component({
  selector: 'app-home',
  imports: [DeliverableCard, ModalShell, DeliverableForm, CourseForm, AnalysisPanel, ClassroomImport],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class Home implements OnInit {
  private deliverablesApi = inject(DeliverablesService);
  private coursesApi = inject(CoursesService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  auth = inject(AuthService);

  pending = signal<Deliverable[]>([]);
  courses = signal<Course[]>([]);
  modal = signal<Modal>(null);
  /** aviso corto tras volver de conectar Classroom */
  notice = signal<string | null>(null);

  ngOnInit(): void {
    this.reload();
    this.loadCourses();

    // Volvimos del consentimiento de Classroom (?classroom=connected|error).
    // El botón está oculto por ahora, pero si alguien llega con el flag lo
    // limpiamos igual.
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
    this.deliverablesApi.list({ status: 'pending' }).subscribe((list) =>
      this.pending.set([...list].sort((a, b) => a.due_date.localeCompare(b.due_date))),
    );
  }

  markSubmitted(id: number): void {
    this.deliverablesApi
      .update(id, { submitted_at: new Date().toISOString() })
      .subscribe(() => this.reload());
  }

  onSaved(): void {
    this.modal.set(null);
    // Recargar AMBOS: una materia nueva debe aparecer en "Analizar" y en el
    // form de entregables; un entregable nuevo, en la lista de pendientes.
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

