import { Component, inject, input, output, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CoursesService } from '../../../core/api/courses.service';
import { Course } from '../../../core/models/course.model';
import { Category } from '../../../core/models/category.model';

@Component({
  selector: 'app-course-edit',
  imports: [FormsModule],
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
  // categoría nueva en edición
  newCat = signal<{ name: string; percentage: number }>({ name: '', percentage: 0 });
  busy = signal(false);

  ngOnInit(): void {
    this.name.set(this.course().name);
    this.reloadCategories();
  }

  private reloadCategories(): void {
    this.api.categories(this.course().id).subscribe((c) => this.categories.set(c));
  }

  get total(): number {
    return this.categories().reduce((s, c) => s + Number(c.percentage || 0), 0);
  }

  saveName(): void {
    const n = this.name().trim();
    if (!n || n === this.course().name) return;
    this.busy.set(true);
    this.api.update(this.course().id, { name: n }).subscribe({
      next: () => {
        this.busy.set(false);
        this.saved.emit();
      },
      error: () => this.busy.set(false),
    });
  }

  saveCategory(c: Category): void {
    this.api
      .updateCategory(c.id, { name: c.name, percentage: c.percentage })
      .subscribe(() => this.reloadCategories());
  }

  addCategory(): void {
    const { name, percentage } = this.newCat();
    if (!name.trim()) return;
    this.api
      .addCategory(this.course().id, { name: name.trim(), percentage })
      .subscribe(() => {
        this.newCat.set({ name: '', percentage: 0 });
        this.reloadCategories();
      });
  }

  removeCategory(c: Category): void {
    if (!confirm(`¿Eliminar la categoría "${c.name}"? Se borran sus entregables.`)) return;
    this.api.removeCategory(c.id).subscribe(() => this.reloadCategories());
  }

  onDelete(): void {
    if (!confirm(`¿Eliminar la materia "${this.course().name}" y todo lo suyo?`)) return;
    this.api.remove(this.course().id).subscribe(() => this.deleted.emit());
  }
}
