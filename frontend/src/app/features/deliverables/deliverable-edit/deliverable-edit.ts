import { Component, inject, input, output, signal, OnInit } from '@angular/core';
import { ReactiveFormsModule, NonNullableFormBuilder, Validators } from '@angular/forms';
import { CoursesService } from '../../../core/api/courses.service';
import { DeliverablesService } from '../../../core/api/deliverables.service';
import { Deliverable } from '../../../core/models/deliverable.model';
import { Category } from '../../../core/models/category.model';

/** Convierte un ISO UTC a el string que espera <input type="datetime-local">. */
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

@Component({
  selector: 'app-deliverable-edit',
  imports: [ReactiveFormsModule],
  templateUrl: './deliverable-edit.html',
})
export class DeliverableEdit implements OnInit {
  private fb = inject(NonNullableFormBuilder);
  private coursesApi = inject(CoursesService);
  private deliverablesApi = inject(DeliverablesService);

  deliverable = input.required<Deliverable>();
  saved = output<void>();
  deleted = output<void>();

  categories = signal<Category[]>([]);

  form = this.fb.group({
    name: ['', Validators.required],
    category_id: [0, Validators.min(1)],
    due_date: ['', Validators.required],
    submitted: [false],
    grade: this.fb.control<number | null>(null),
  });

  ngOnInit(): void {
    const d = this.deliverable();
    this.form.setValue({
      name: d.name,
      category_id: d.category_id,
      due_date: toLocalInput(d.due_date),
      submitted: d.submitted_at !== null,
      grade: d.grade,
    });
    this.coursesApi.categories(d.course_id).subscribe((c) => this.categories.set(c));
  }

  /** El grade solo tiene sentido si está entregado. */
  get gradeEnabled(): boolean {
    return this.form.controls.submitted.value;
  }

  submit(): void {
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    const d = this.deliverable();

    // submitted_at: si se marca y no lo estaba, ahora; si se desmarca, null.
    let submitted_at: string | null | undefined;
    if (v.submitted && !d.submitted_at) submitted_at = new Date().toISOString();
    else if (!v.submitted && d.submitted_at) submitted_at = null;

    this.deliverablesApi
      .update(d.id, {
        name: v.name,
        category_id: v.category_id,
        due_date: new Date(v.due_date).toISOString(),
        ...(submitted_at !== undefined ? { submitted_at } : {}),
        grade: v.submitted ? v.grade : null,
      })
      .subscribe(() => this.saved.emit());
  }

  onDelete(): void {
    if (!confirm(`¿Eliminar "${this.deliverable().name}"?`)) return;
    this.deliverablesApi.remove(this.deliverable().id).subscribe(() => this.deleted.emit());
  }
}
