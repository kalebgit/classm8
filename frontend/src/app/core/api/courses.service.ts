import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Course, CourseWithCategories, NewCourse } from '../models/course.model';
import { Category, NewCategory } from '../models/category.model';

@Injectable({'providedIn': 'root'})
export class CoursesService {
    private http = inject(HttpClient)
    private base = `${environment.apiUrl}/courses`

    list(): Observable<Course[]>{
        return this.http.get<Course[]>(this.base)
    }

    create(body: NewCourse): Observable<CourseWithCategories>{
        return this.http.post<CourseWithCategories>(this.base, body)
    }

    categories(courseId: number): Observable<Category[]>{
        return this.http.get<Category[]>(`${this.base}/${courseId}/categories`)
    }

    addCategory(courseId: number, body: NewCategory): Observable<Category>{
        return this.http.post<Category>(`${this.base}/${courseId}/categories`, body)
    }

}