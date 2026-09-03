import { Component, inject, output } from '@angular/core';
import { ReactiveFormsModule, NonNullableFormBuilder, Validators } from '@angular/forms';
import { CoursesService } from '../../../core/api/courses.service';

@Component({
  selector: 'app-course-form',
  imports: [ReactiveFormsModule],
  templateUrl: './course-form.html',
  styleUrl: './course-form.scss',
})
export class CourseForm {
  private fb = inject(NonNullableFormBuilder);
  private api = inject(CoursesService);
  saved = output<void>();

  //estructura general del form
  form = this.fb.group({
    name: ['', Validators.required],
    categories: this.fb.array([this.categoryGroup()]),
  });

  get categories() {
    return this.form.controls.categories;
  }

  private categoryGroup() {
    return this.fb.group({
      name: ['', Validators.required],
      percentage: [0, [Validators.required, Validators.min(0), Validators.max(100)]],
    });
  }

  addCategory(): void {
    this.categories.push(this.categoryGroup());
  }

  removeCategory(i: number): void {
    this.categories.removeAt(i);
  }

  get total(): number {
    return this.categories.getRawValue().reduce((s, c) => s + (c.percentage || 0), 0);
  }

  submit(): void {
    // Ya no se exige total === 100: algunos criterios reparten más de 100
    // (categorías con puntos extra). Solo se validan los campos del form.
    if (this.form.invalid) return;
    //como getRawValue devuelve un diccionario debe coincidir
    //para los endpoints de la api
    this.api.create(this.form.getRawValue()).subscribe(() => this.saved.emit());
  }
}