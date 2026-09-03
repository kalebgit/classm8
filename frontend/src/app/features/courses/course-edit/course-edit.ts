import { Component, inject, input, output, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CoursesService } from '../../../core/api/courses.service';
import { Course } from '../../../core/models/course.model';
import { Category } from '../../../core/models/category.model';
import { StatusLine, Status } from '../../../shared/components/status-line/status-line';

@Component({
  selector: 'app-course-edit',
  imports: [FormsModule, StatusLine],
  templateUrl: './course-edit.html',
  styleUrl: './course-edit.scss',
})
export class CourseEdit implements OnInit {
  private api = inject(CoursesService);

  course = input.required<Course>();
  saved = output<void>();
  deleted = output<void>();

  name = signal('');
  categories = signal<Category[]>([]);
  newCat = signal<{ name: string; percentage: number }>({ name: '', percentage: 0 });
  busy = signal(false);
  status = signal<Status>(null);

  ngOnInit(): void {
    this.name.set(this.course().name);
    this.reloadCategories();
  }

  private reloadCategories(): void {
    this.api.categories(this.course().id).subscribe((c) => this.categories.set(c));
  }

  private err(msg: string): (e: unknown) => void {
    return (e: unknown) => {
      this.busy.set(false);
      const detail = (e as { error?: { detail?: string } })?.error?.detail;
      this.status.set({ kind: 'error', text: detail ?? msg });
    };
  }

  get total(): number {
    return this.categories().reduce((s, c) => s + Number(c.percentage || 0), 0);
  }

  /** "Guardar" del modal: aplica el nombre si cambió y confirma. */
  save(): void {
    const n = this.name().trim();
    if (!n) {
      this.status.set({ kind: 'error', text: 'El nombre no puede estar vacío.' });
      return;
    }
    if (n === this.course().name) {
      this.status.set({ kind: 'ok', text: 'Sin cambios en el nombre.' });
      return;
    }
    this.busy.set(true);
    this.api.update(this.course().id, { name: n }).subscribe({
      next: () => {
        this.busy.set(false);
        this.status.set({ kind: 'ok', text: 'Materia actualizada.' });
        this.saved.emit();
      },
      error: this.err('No se pudo actualizar la materia.'),
    });
  }

  saveCategory(c: Category): void {
    this.api.updateCategory(c.id, { name: c.name, percentage: c.percentage }).subscribe({
      next: () => {
        this.status.set({ kind: 'ok', text: `Categoría "${c.name}" guardada.` });
        this.reloadCategories();
      },
      error: this.err('No se pudo guardar la categoría.'),
    });
  }

  addCategory(): void {
    const { name, percentage } = this.newCat();
    if (!name.trim()) {
      this.status.set({ kind: 'error', text: 'La categoría necesita nombre.' });
      return;
    }
    this.api.addCategory(this.course().id, { name: name.trim(), percentage }).subscribe({
      next: () => {
        this.newCat.set({ name: '', percentage: 0 });
        this.status.set({ kind: 'ok', text: 'Categoría agregada.' });
        this.reloadCategories();
      },
      error: this.err('No se pudo agregar la categoría.'),
    });
  }

  removeCategory(c: Category): void {
    if (!confirm(`¿Eliminar la categoría "${c.name}"? Se borran sus entregables.`)) return;
    this.api.removeCategory(c.id).subscribe({
      next: () => {
        this.status.set({ kind: 'ok', text: `Categoría "${c.name}" eliminada.` });
        this.reloadCategories();
      },
      error: this.err('No se pudo eliminar la categoría.'),
    });
  }

  onDelete(): void {
    if (!confirm(`¿Eliminar la materia "${this.course().name}" y todo lo suyo?`)) return;
    this.api.remove(this.course().id).subscribe({
      next: () => this.deleted.emit(),
      error: this.err('No se pudo eliminar la materia.'),
    });
  }
}
