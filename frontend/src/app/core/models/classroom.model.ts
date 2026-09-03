export interface ScannedCoursework {
  classroom_id: string;
  title: string;
  due_at: string; // ISO, fija: viene de Classroom
  link: string | null;
  already_imported: boolean;
}

export interface ScannedCourse {
  classroom_id: string;
  name: string;
  coursework: ScannedCoursework[];
}

export interface ScanResult {
  connected: boolean;
  courses: ScannedCourse[];
}

/** Un coursework que el usuario decidió importar, con el mapeo ya resuelto. */
export interface ImportItem {
  classroom_coursework_id: string;
  name: string;
  due_date: string;
  course_id: number | null; // materia existente
  new_course_name: string | null; // o crear una nueva
  category_id: number | null; // obligatoria si course_id
}

export interface ImportResult {
  created_courses: number;
  created_deliverables: number;
  skipped: number;
}
