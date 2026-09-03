import { Component, input, output } from '@angular/core';

@Component({
  selector: 'app-modal-shell',
  templateUrl: './modal-shell.html',
  styleUrl: './modal-shell.scss',
})
export class ModalShell {
  title = input.required<string>();
  close = output<void>();
}