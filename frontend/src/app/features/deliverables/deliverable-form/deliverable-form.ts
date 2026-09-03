import { Component, inject, input, output, signal } from '@angular/core';
import { ReactiveFormsModule, NonNullableFormBuilder, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CoursesService } from '../../../core/api/courses.service';
import { DeliverablesService } from '../../../core/api/deliverables.service';
import { Course } from '../../../core/models/course.model';
import { Category } from '../../../core/models/category.model';

@Component({
  selector: 'app-deliverable-form',
  imports: [ReactiveFormsModule],
  templateUrl: './deliverable-form.html',
})
export class DeliverableForm {
  private fb = inject(NonNullableFormBuilder);
  private coursesApi = inject(CoursesService);
  private deliverablesApi = inject(DeliverablesService);

  courses = input.required<Course[]>();
  saved = output<void>();

  categories = signal<Category[]>([]);

  form = this.fb.group({
    name: ['', Validators.required],
    course_id: [0, Validators.min(1)],
    category_id: [0, Validators.min(1)],
    due_date: ['', Validators.required],
  });

  constructor() {
    this.form.controls.course_id.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe((id) => {
        //seteamos en 0 porque es como si no eligieras categoria
        //pues se cambio de curso
        this.form.controls.category_id.setValue(0);
        this.categories.set([]);
        if (id) this.coursesApi.categories(id).subscribe((c) => this.categories.set(c));
      });
  }

  submit(): void {
    if (this.form.invalid) return;
    const { name, course_id, category_id, due_date } = this.form.getRawValue();
    this.deliverablesApi
      .create({
        name,
        course_id,
        category_id,
        due_date: new Date(due_date).toISOString(),
        previous_phase_id: null,
      })
      .subscribe(() => this.saved.emit());
}
}