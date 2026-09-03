import { Component, inject, input, output, signal, OnInit } from '@angular/core';
import { ReactiveFormsModule, NonNullableFormBuilder, Validators } from '@angular/forms';
import { CoursesService } from '../../../core/api/courses.service';
import { Course } from '../../../core/models/course.model';
import { Category } from '../../../core/models/category.model';
import { StatusLine, Status } from '../../../shared/components/status-line/status-line';

@Component({
  selector: 'app-course-edit',
  imports: [ReactiveFormsModule, StatusLine],
  templateUrl: './course-edit.html',
  styleUrl: './course-edit.scss',
})
export class CourseEdit implements OnInit {
  private fb = inject(NonNullableFormBuilder);
  private api = inject(CoursesService);

  course = input.required<Course>();
  /** cambio parcial persistido (una categoría): el padre refresca sin cerrar */
  changed = output<void>();
  /** terminó: el padre cierra el modal y muestra el mensaje */
  done = output<string>();
  deleted = output<void>();

  categories = signal<Category[]>([]);
  busy = signal(false);
  status = signal<Status>(null);

  nameForm = this.fb.group({
    name: ['', Validators.required],
  });

  // form de UNA categoría nueva
  newCatForm = this.fb.group({
    name: ['', Validators.required],
    percentage: [0, [Validators.required, Validators.min(0), Validators.max(100)]],
  });

  ngOnInit(): void {
    this.nameForm.setValue({ name: this.course().name });
    this.reloadCategories();
  }

  private reloadCategories(): void {
    this.api.categories(this.course().id).subscribe((c) => this.categories.set(c));
  }

  private onErr(msg: string) {
    return (e: unknown) => {
      this.busy.set(false);
      const detail = (e as { error?: { detail?: string } })?.error?.detail;
      this.status.set({ kind: 'error', text: detail ?? msg });
      console.error('[course-edit]', msg, e);
    };
  }

  get total(): number {
    return this.categories().reduce((s, c) => s + Number(c.percentage || 0), 0);
  }

  save(): void {
    const n = this.nameForm.getRawValue().name.trim();
    console.log('[course-edit] save()', { nuevo: n, actual: this.course().name });
    if (!n) {
      this.status.set({ kind: 'error', text: 'El nombre no puede estar vacío.' });
      return;
    }
    if (n === this.course().name) {
      this.done.emit('Materia guardada.');
      return;
    }
    this.busy.set(true);
    this.api.update(this.course().id, { name: n }).subscribe({
      next: (res) => {
        console.log('[course-edit] PATCH ok', res);
        this.busy.set(false);
        this.changed.emit();
        this.done.emit('Materia actualizada.');
      },
      error: this.onErr('No se pudo actualizar la materia.'),
    });
  }

  saveCategory(c: Category): void {
    console.log('[course-edit] saveCategory', c);
    this.api.updateCategory(c.id, { name: c.name, percentage: c.percentage }).subscribe({
      next: () => {
        this.status.set({ kind: 'ok', text: `Categoría "${c.name}" guardada.` });
        this.changed.emit();
        this.reloadCategories();
      },
      error: this.onErr('No se pudo guardar la categoría.'),
    });
  }

  addCategory(): void {
    console.log('[course-edit] addCategory', this.newCatForm.getRawValue(), 'valid:', this.newCatForm.valid);
    if (this.newCatForm.invalid) {
      this.status.set({ kind: 'error', text: 'La categoría necesita nombre y un porcentaje 0-100.' });
      return;
    }
    const { name, percentage } = this.newCatForm.getRawValue();
    this.busy.set(true);
    this.api.addCategory(this.course().id, { name: name.trim(), percentage }).subscribe({
      next: (created) => {
        console.log('[course-edit] categoría creada', created);
        this.busy.set(false);
        this.newCatForm.reset({ name: '', percentage: 0 });
        this.status.set({ kind: 'ok', text: `Categoría "${created.name}" agregada.` });
        this.changed.emit();
        this.reloadCategories();
      },
      error: this.onErr('No se pudo agregar la categoría.'),
    });
  }

  removeCategory(c: Category): void {
    if (!confirm(`¿Eliminar la categoría "${c.name}"? Se borran sus entregables.`)) return;
    this.api.removeCategory(c.id).subscribe({
      next: () => {
        this.status.set({ kind: 'ok', text: `Categoría "${c.name}" eliminada.` });
        this.changed.emit();
        this.reloadCategories();
      },
      error: this.onErr('No se pudo eliminar la categoría.'),
    });
  }

  onDelete(): void {
    if (!confirm(`¿Eliminar la materia "${this.course().name}" y todo lo suyo?`)) return;
    this.api.remove(this.course().id).subscribe({
      next: () => this.deleted.emit(),
      error: this.onErr('No se pudo eliminar la materia.'),
    });
  }

  /** actualiza en memoria el valor editado de una categoría existente */
  patchCat(c: Category, field: 'name' | 'percentage', value: string): void {
    if (field === 'name') c.name = value;
    else c.percentage = Number(value);
  }
}
