import { Component, input } from '@angular/core';

/** Línea de estado para modales: ok / error / info. Null = oculto. */
export type Status = { kind: 'ok' | 'error' | 'info'; text: string } | null;

@Component({
  selector: 'app-status-line',
  imports: [],
  template: `
    @if (status(); as s) {
      <p class="status" [class.ok]="s.kind === 'ok'" [class.err]="s.kind === 'error'">
        {{ s.text }}
      </p>
    }
  `,
  styles: [
    `
    .status {
      font-size: 12px;
      margin: 8px 0 0;
      padding: 6px 8px;
      border: 1px solid var(--line);
      color: var(--dim);
    }
    .status.ok  { color: #5fbf6a; border-color: #5fbf6a; }
    .status.err { color: var(--due); border-color: var(--due); }
  `,
  ],
})
export class StatusLine {
  status = input<Status>(null);
}
