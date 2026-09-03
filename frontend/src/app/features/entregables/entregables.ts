import { Component, inject, signal, computed, effect } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DeliverableCard } from '../../shared/components/deliverable-card/deliverable-card';
import { ModalShell } from '../../shared/components/modal-shell/modal-shell';
import { DeliverableEdit } from '../deliverables/deliverable-edit/deliverable-edit';
import { DeliverablesService } from '../../core/api/deliverables.service';
import { Deliverable } from '../../core/models/deliverable.model';
import { DataBus } from '../../core/data-bus';

type StatusFilter = 'all' | 'pending' | 'submitted' | 'graded' | 'overdue' | 'soon';
type SortKey = 'due-asc' | 'due-desc' | 'grade-desc' | 'name';

@Component({
  selector: 'app-entregables',
  imports: [FormsModule, DeliverableCard, ModalShell, DeliverableEdit],
  templateUrl: './entregables.html',
  styleUrl: './entregables.scss',
})
export class Entregables {
  private api = inject(DeliverablesService);
  private bus = inject(DataBus);

  all = signal<Deliverable[]>([]);
  editing = signal<Deliverable | null>(null);

  // --- estado de los filtros ---
  status = signal<StatusFilter>('all');
  courseId = signal(0); // 0 = todas
  categoryId = signal(0); // 0 = todos
  sort = signal<SortKey>('due-asc');

  constructor() {
    effect(() => {
      this.bus.version();
      this.reload();
    });
  }

  reload(): void {
    this.api.list().subscribe((list) => this.all.set(list));
  }

  /** opciones de materia para el <select>, deducidas de los datos */
  courseOptions = computed(() => {
    const seen = new Map<number, string>();
    for (const d of this.all()) seen.set(d.course_id, d.course_name);
    return [...seen.entries()].map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  /** opciones de criterio (categoría); si hay materia elegida, solo las suyas */
  categoryOptions = computed(() => {
    const cid = this.courseId();
    const seen = new Map<number, string>();
    for (const d of this.all()) {
      if (cid && d.course_id !== cid) continue;
      seen.set(d.category_id, d.category_name);
    }
    return [...seen.entries()].map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  /** lista final: filtrada + ordenada */
  view = computed(() => {
    const now = Date.now();
    const weekAhead = now + 7 * 24 * 3600 * 1000;
    let list = this.all().filter((d) => {
      if (this.courseId() && d.course_id !== this.courseId()) return false;
      if (this.categoryId() && d.category_id !== this.categoryId()) return false;

      const due = new Date(d.due_date).getTime();
      switch (this.status()) {
        case 'pending':
          return !d.submitted_at;
        case 'submitted':
          return d.submitted_at !== null && d.grade === null;
        case 'graded':
          return d.grade !== null;
        case 'overdue':
          return !d.submitted_at && due < now;
        case 'soon':
          return !d.submitted_at && due >= now && due <= weekAhead;
        default:
          return true;
      }
    });

    const byDue = (a: Deliverable, b: Deliverable) => a.due_date.localeCompare(b.due_date);
    switch (this.sort()) {
      case 'due-desc':
        list = [...list].sort((a, b) => byDue(b, a));
        break;
      case 'grade-desc':
        list = [...list].sort((a, b) => (b.grade ?? -1) - (a.grade ?? -1));
        break;
      case 'name':
        list = [...list].sort((a, b) => a.name.localeCompare(b.name));
        break;
      default:
        list = [...list].sort(byDue);
    }
    return list;
  });

  onCourseChange(): void {
    // al cambiar de materia, el criterio elegido puede dejar de aplicar
    this.categoryId.set(0);
  }

  clearFilters(): void {
    this.status.set('all');
    this.courseId.set(0);
    this.categoryId.set(0);
    this.sort.set('due-asc');
  }

  markSubmitted(id: number): void {
    this.api.update(id, { submitted_at: new Date().toISOString() }).subscribe(() => this.reload());
  }

  removeDeliverable(id: number): void {
    if (!confirm('¿Eliminar este entregable?')) return;
    this.api.remove(id).subscribe(() => this.reload());
  }

  openEdit(d: Deliverable): void {
    this.editing.set(d);
  }

  onEdited(): void {
    this.editing.set(null);
    this.reload();
  }
}
