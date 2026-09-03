import { Component, inject, signal, OnInit } from '@angular/core';
import { DeliverableCard } from '../../shared/components/deliverable-card/deliverable-card';
import { DeliverablesService } from '../../core/api/deliverables.service';
import { CoursesService } from '../../core/api/courses.service';
import { Deliverable } from '../../core/models/deliverable.model';
import { Course } from '../../core/models/course.model';
import { ModalShell } from '../../shared/components/modal-shell/modal-shell';
import { DeliverableForm } from '../deliverables/deliverable-form/deliverable-form';
import { CourseForm } from '../courses/course-form/course-form';
import { PixelGauge } from '../../shared/components/pixel-gauge/pixel-gauge';
import { AnalysisPanel } from '../analysis/analysis-panel/analysis-panel';
import { AuthService } from '../../core/api/auth.service';
import { Router } from '@angular/router';

type Modal = 'course' | 'deliverable' | 'analysis' | null;

@Component({
  selector: 'app-home',
  imports: [DeliverableCard, ModalShell, DeliverableForm, CourseForm, AnalysisPanel, ModalShell],
  templateUrl: './home.html',
  styleUrl: './home.scss',
})
export class Home {
  private deliverablesApi = inject(DeliverablesService);
  private coursesApi = inject(CoursesService);
  private router = inject(Router);
  auth = inject(AuthService);

  pending = signal<Deliverable[]>([]);
  courses = signal<Course[]>([]);
  modal = signal<Modal>(null);

  ngOnInit(): void{
    this.reload()
    this.coursesApi.list().subscribe( (c) => this.courses.set(c))

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
    this.reload();
  }

  async logout(): Promise<void> {
    await this.auth.logout();
    this.router.navigate(['/login']);
  }
}

