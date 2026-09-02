export interface CategoryAnalysis {
  category_id: number;
  name: string;
  percentage: number;
  average: number | null;
  points: number;
  graded_count: number;
  total_count: number;
}

export interface CourseAnalysis {
  course_id: number;
  course_name: string;
  current_grade: number;
  evaluated_percentage: number;
  projected_grade: number | null;
  categories: CategoryAnalysis[];
}