import { Component, input, output, OnInit, OnDestroy } from '@angular/core';

/**
 * Mientras el modal está abierto, el <body> no debe poder scrollear: en
 * iOS Safari un overlay `position: fixed` sobre una página larga deja el
 * fondo "atorado" (el dedo scrollea el body detrás del modal en vez del
 * contenido interno del modal). Se restaura al cerrar/destruir.
 */
@Component({
  selector: 'app-modal-shell',
  templateUrl: './modal-shell.html',
  styleUrl: './modal-shell.scss',
})
export class ModalShell implements OnInit, OnDestroy {
  title = input.required<string>();
  close = output<void>();

  private previousOverflow = '';

  ngOnInit(): void {
    this.previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }

  ngOnDestroy(): void {
    document.body.style.overflow = this.previousOverflow;
  }
}