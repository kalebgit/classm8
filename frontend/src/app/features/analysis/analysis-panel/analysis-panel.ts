import { Component, inject, input, signal } from '@angular/core';
import { PixelGauge } from '../../../shared/components/pixel-gauge/pixel-gauge';
import { AnalysisService } from '../../../core/api/analysis.service';
import { Course } from '../../../core/models/course.model';
import { CourseAnalysis } from '../../../core/models/analysis.model';

@Component({
  selector: 'app-analysis-panel',
  imports: [PixelGauge],
  templateUrl: './analysis-panel.html',
  styleUrl: './analysis-panel.scss',
})
export class AnalysisPanel {
  private api = inject(AnalysisService);
  courses = input.required<Course[]>();

  data = signal<CourseAnalysis | null>(null);

  pick(id: number): void {
    this.data.set(null);
    if (id) this.api.forCourse(id).subscribe((d) => this.data.set(d));
  }
}