export interface Deliverable {
  id: number;
  name: string;
  due_date: string;
  submitted_at: string | null;
  grade: number | null;
  course_id: number;
  course_name: string;
  category_id: number;
  category_name: string;
  previous_phase_id: number | null;
}

export interface NewDeliverable {
  name: string;
  due_date: string;
  course_id: number;
  category_id: number;
  previous_phase_id: number | null;
}

export type DeliverableStatus = 'pending' | 'submitted' | 'graded';
