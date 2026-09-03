import { Component, inject, signal, effect, OnInit } from '@angular/core';
import { DeliverableCard } from '../../shared/components/deliverable-card/deliverable-card';
import { DeliverablesService } from '../../core/api/deliverables.service';
import { CoursesService } from '../../core/api/courses.service';
import { Deliverable } from '../../core/models/deliverable.model';
import { Course } from '../../core/models/course.model';
import { ModalShell } from '../../shared/components/modal-shell/modal-shell';
import { DeliverableEdit } from '../deliverables/deliverable-edit/deliverable-edit';
import { DataBus } from '../../core/data-bus';

@Component({
  selector: 'app-pendientes',
  imports: [DeliverableCard, ModalShell, DeliverableEdit],
  templateUrl: './pendientes.html',
  styleUrl: './pendientes.scss',
})
export class Pendientes implements OnInit {
  private deliverablesApi = inject(DeliverablesService);
  private coursesApi = inject(CoursesService);
  private bus = inject(DataBus);

  pending = signal<Deliverable[]>([]);
  courses = signal<Course[]>([]);
  editing = signal<Deliverable | null>(null);

  constructor() {
    // recargar cuando el Shell avise de un cambio
    effect(() => {
      this.bus.version();
      this.reload();
    });
  }

  ngOnInit(): void {
    this.coursesApi.list().subscribe((c) => this.courses.set(c));
  }

  reload(): void {
    // solo PENDIENTES (sin entregar), ordenados por fecha de entrega
    this.deliverablesApi.list({ status: 'pending' }).subscribe((list) =>
      this.pending.set([...list].sort((a, b) => a.due_date.localeCompare(b.due_date))),
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

  openEdit(d: Deliverable): void {
    this.editing.set(d);
  }

  onEdited(): void {
    this.editing.set(null);
    this.reload();
  }
}
