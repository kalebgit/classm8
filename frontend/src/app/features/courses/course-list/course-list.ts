import { Component, input, output } from '@angular/core';
import { Course } from '../../../core/models/course.model';

@Component({
  selector: 'app-course-list',
  imports: [],
  templateUrl: './course-list.html',
  styleUrl: './course-list.scss',
})
export class CourseList {
  courses = input.required<Course[]>();
  edit = output<Course>();
  remove = output<number>();
}
