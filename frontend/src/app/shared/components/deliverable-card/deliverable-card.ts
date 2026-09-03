import { Component, input, output } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Deliverable } from '../../../core/models/deliverable.model';

@Component({
  selector: 'app-deliverable-card',
  imports: [DatePipe],
  templateUrl: './deliverable-card.html',
  styleUrl: './deliverable-card.scss',
})
export class DeliverableCard {
  deliverable = input.required<Deliverable>();
  submit = output<number>(); // marcar entregado
  edit = output<Deliverable>(); // abrir modal de edición
  remove = output<number>(); // eliminar

  get overdue(): boolean {
    const d = this.deliverable();
    return !d.submitted_at && new Date(d.due_date) < new Date();
  }
}