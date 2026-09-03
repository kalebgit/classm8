import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { CourseAnalysis } from '../models/analysis.model';

@Injectable({ providedIn: 'root' })
export class AnalysisService {
  private http = inject(HttpClient);

  forCourse(courseId: number): Observable<CourseAnalysis> {
    return this.http.get<CourseAnalysis>(`${environment.apiUrl}/courses/${courseId}/analysis`);
  }
}