import { Component, inject, signal, computed, effect } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { DeliverableCard } from '../../shared/components/deliverable-card/deliverable-card';
import { ModalShell } from '../../shared/components/modal-shell/modal-shell';
import { DeliverableEdit } from '../deliverables/deliverable-edit/deliverable-edit';
import { GradeModal } from '../deliverables/grade-modal/grade-modal';
import { DeliverablesService } from '../../core/api/deliverables.service';
import { Deliverable } from '../../core/models/deliverable.model';
import { DataBus } from '../../core/data-bus';

/** 'pending' = no entregados · 'submitted' = entregados */
export type ViewMode = 'pending' | 'submitted';

type SortKey = 'due-asc' | 'due-desc' | 'grade-desc' | 'name';

@Component({
  selector: 'app-deliverables-view',
  imports: [FormsModule, DeliverableCard, ModalShell, DeliverableEdit, GradeModal],
  templateUrl: './deliverables-view.html',
  styleUrl: './deliverables-view.scss',
})
export class DeliverablesView {
  private api = inject(DeliverablesService);
  private bus = inject(DataBus);
  private route = inject(ActivatedRoute);

  /** modo de la vista (de route data) */
  mode = signal<ViewMode>('pending');

  all = signal<Deliverable[]>([]);
  editing = signal<Deliverable | null>(null);
  grading = signal<Deliverable | null>(null);

  // --- filtros ---
  // estado: depende del modo
  //   pending  -> all | overdue | soon
  //   submitted -> all | ungraded | graded
  statusFilter = signal<string>('all');
  courseId = signal(0);
  categoryId = signal(0);
  sort = signal<SortKey>('due-asc');

  constructor() {
    // el modo viene de route.data; al cambiar de ruta se reinicia el filtro
    this.route.data.subscribe((d) => {
      this.mode.set((d['mode'] as ViewMode) ?? 'pending');
      this.statusFilter.set('all');
      this.courseId.set(0);
      this.categoryId.set(0);
      this.sort.set(this.mode() === 'submitted' ? 'grade-desc' : 'due-asc');
    });

    effect(() => {
      this.bus.version();
      this.reload();
    });
  }

  reload(): void {
    this.api.list().subscribe((list) => this.all.set(list));
  }

  /** entregables que pertenecen a este modo (antes de filtros finos) */
  private inMode = computed(() =>
    this.all().filter((d) =>
      this.mode() === 'pending' ? !d.submitted_at : d.submitted_at !== null,
    ),
  );
  inModeCount = computed(() => this.inMode().length);

  courseOptions = computed(() => {
    const seen = new Map<number, string>();
    for (const d of this.inMode()) seen.set(d.course_id, d.course_name);
    return [...seen.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  categoryOptions = computed(() => {
    const cid = this.courseId();
    const seen = new Map<number, string>();
    for (const d of this.inMode()) {
      if (cid && d.course_id !== cid) continue;
      seen.set(d.category_id, d.category_name);
    }
    return [...seen.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  view = computed(() => {
    const now = Date.now();
    const weekAhead = now + 7 * 24 * 3600 * 1000;
    let list = this.inMode().filter((d) => {
      if (this.courseId() && d.course_id !== this.courseId()) return false;
      if (this.categoryId() && d.category_id !== this.categoryId()) return false;

      const due = new Date(d.due_date).getTime();
      const s = this.statusFilter();
      if (this.mode() === 'pending') {
        if (s === 'overdue') return due < now;
        if (s === 'soon') return due >= now && due <= weekAhead;
        return true; // 'all'
      } else {
        if (s === 'ungraded') return d.grade === null;
        if (s === 'graded') return d.grade !== null;
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
    this.categoryId.set(0);
  }

  clearFilters(): void {
    this.statusFilter.set('all');
    this.courseId.set(0);
    this.categoryId.set(0);
    this.sort.set(this.mode() === 'submitted' ? 'grade-desc' : 'due-asc');
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
  openGrade(d: Deliverable): void {
    this.grading.set(d);
  }

  onEdited(): void {
    this.editing.set(null);
    this.reload();
  }
  onGraded(): void {
    this.grading.set(null);
    this.reload();
  }
}
