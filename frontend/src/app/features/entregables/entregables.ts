import { Component, inject, signal, effect } from '@angular/core';
import { DeliverableCard } from '../../shared/components/deliverable-card/deliverable-card';
import { ModalShell } from '../../shared/components/modal-shell/modal-shell';
import { DeliverableEdit } from '../deliverables/deliverable-edit/deliverable-edit';
import { DeliverablesService } from '../../core/api/deliverables.service';
import { Deliverable } from '../../core/models/deliverable.model';
import { DataBus } from '../../core/data-bus';

@Component({
  selector: 'app-entregables',
  imports: [DeliverableCard, ModalShell, DeliverableEdit],
  templateUrl: './entregables.html',
  styleUrl: './entregables.scss',
})
export class Entregables {
  private api = inject(DeliverablesService);
  private bus = inject(DataBus);

  all = signal<Deliverable[]>([]);
  editing = signal<Deliverable | null>(null);

  constructor() {
    effect(() => {
      this.bus.version();
      this.reload();
    });
  }

  reload(): void {
    this.api.list().subscribe((list) =>
      this.all.set([...list].sort((a, b) => a.due_date.localeCompare(b.due_date))),
    );
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
