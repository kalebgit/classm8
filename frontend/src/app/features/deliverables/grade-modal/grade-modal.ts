import { Component, inject, input, output, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DeliverablesService } from '../../../core/api/deliverables.service';
import { Deliverable } from '../../../core/models/deliverable.model';
import { StatusLine, Status } from '../../../shared/components/status-line/status-line';

/** Modal minúsculo para poner/cambiar la calificación de un entregable. */
@Component({
  selector: 'app-grade-modal',
  imports: [FormsModule, StatusLine],
  templateUrl: './grade-modal.html',
  styleUrl: './grade-modal.scss',
})
export class GradeModal implements OnInit {
  private api = inject(DeliverablesService);

  deliverable = input.required<Deliverable>();
  saved = output<void>();

  grade = signal<number | null>(null);
  busy = signal(false);
  status = signal<Status>(null);

  ngOnInit(): void {
    this.grade.set(this.deliverable().grade);
  }

  save(): void {
    const g = this.grade();
    if (g === null || g < 0 || g > 150) {
      this.status.set({ kind: 'error', text: 'La calificación va de 0 a 150.' });
      return;
    }
    this.busy.set(true);
    // calificar implica que está entregado
    this.api
      .update(this.deliverable().id, {
        grade: g,
        ...(this.deliverable().submitted_at ? {} : { submitted_at: new Date().toISOString() }),
      })
      .subscribe({
        next: () => {
          this.busy.set(false);
          this.saved.emit();
        },
        error: (e: unknown) => {
          this.busy.set(false);
          const detail = (e as { error?: { detail?: string } })?.error?.detail;
          this.status.set({ kind: 'error', text: detail ?? 'No se pudo guardar.' });
        },
      });
  }

  clear(): void {
    this.busy.set(true);
    this.api.update(this.deliverable().id, { grade: null }).subscribe({
      next: () => {
        this.busy.set(false);
        this.saved.emit();
      },
      error: () => {
        this.busy.set(false);
        this.status.set({ kind: 'error', text: 'No se pudo quitar la calificación.' });
      },
    });
  }
}
