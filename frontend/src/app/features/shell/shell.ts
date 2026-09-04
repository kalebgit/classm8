import { Component, inject, signal, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NavBar } from '../../shared/components/nav-bar/nav-bar';
import { AuthService } from '../../core/api/auth.service';
import { ClassroomService } from '../../core/api/classroom.service';
import { CoursesService } from '../../core/api/courses.service';
import { DeliverablesService } from '../../core/api/deliverables.service';
import { ModalShell } from '../../shared/components/modal-shell/modal-shell';
import { CourseForm } from '../courses/course-form/course-form';
import { DeliverableForm } from '../deliverables/deliverable-form/deliverable-form';
import { ClassroomImport } from '../classroom/classroom-import/classroom-import';
import { Course } from '../../core/models/course.model';
import { Router } from '@angular/router';
import { DataBus } from '../../core/data-bus';

type Modal = 'course' | 'deliverable' | 'classroom' | null;

/**
 * Layout con la barra de cuenta, el navbar y el <router-outlet> de las 4
 * secciones. Los botones globales (crear materia/entregable, conectar
 * Classroom) viven aquí; al guardar avisan por DataBus para que la sección
 * activa recargue.
 */
@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, NavBar, ModalShell, CourseForm, DeliverableForm, ClassroomImport],
  templateUrl: './shell.html',
  styleUrl: './shell.scss',
  host: { class: 'shell-host' },
})
export class Shell implements OnInit {
  auth = inject(AuthService);
  private classroomApi = inject(ClassroomService);
  private coursesApi = inject(CoursesService);
  private router = inject(Router);
  bus = inject(DataBus);

  modal = signal<Modal>(null);
  courses = signal<Course[]>([]);
  notice = signal<string | null>(null);

  classroomConnected = () => this.auth.user()?.classroom_connected ?? false;

  ngOnInit(): void {
    this.loadCourses();
  }

  private loadCourses(): void {
    this.coursesApi.list().subscribe((c) => this.courses.set(c));
  }

  onSaved(): void {
    this.modal.set(null);
    this.loadCourses();
    this.bus.dataChanged(); // que la sección activa recargue
  }

  onImported(): void {
    this.modal.set(null);
    this.notice.set('Importación completa.');
    this.loadCourses();
    this.bus.dataChanged();
  }

  connectClassroom(): void {
    this.classroomApi.connect();
  }

  disconnectClassroom(): void {
    if (!confirm('¿Desconectar Classroom? classm8 olvidará el permiso guardado.')) return;
    this.classroomApi.disconnect().subscribe(() => {
      this.auth.refresh().then(() => this.notice.set('Classroom desconectado.'));
    });
  }

  async logout(): Promise<void> {
    await this.auth.logout();
    this.router.navigate(['/login']);
  }
}
