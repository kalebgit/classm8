from pydantic import BaseModel


class CategoryAnalysisOut(BaseModel):
    category_id: int
    name: str
    percentage: int
    average: float | None  # promedio de lo calificado; null si no hay nada calificado
    points: float  # average * percentage / 100 (0 si average es null)
    graded_count: int
    total_count: int


class CourseAnalysisOut(BaseModel):
    course_id: int
    course_name: str
    current_grade: float  # suma de points de categorías con calificaciones
    evaluated_percentage: int  # suma de percentage de esas categorías
    categories: list[CategoryAnalysisOut]
