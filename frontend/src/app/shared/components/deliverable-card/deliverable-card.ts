import { Component, input, output } from '@angular/core';

export interface DeliverableUI {
  id: number;
  name: string;
  deadline: string;
  delivered_date: string | null;
  grade: number | null;
  category_name: string;
}

@Component({
  selector: 'app-deliverable-card',
  // imports: [],
  templateUrl: './deliverable-card.html',
  styleUrl: './deliverable-card.scss',
})
export class DeliverableCard {
  deliverable = input.required<DeliverableUI>();

  deliver = output<number>();

  get outdated(): boolean {
    return !this.deliverable().delivered_date
      && new Date(this.deliverable().deadline) < new Date();
  }
}
