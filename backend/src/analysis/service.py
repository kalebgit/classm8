from sqlalchemy import select
from sqlalchemy.orm import Session

from src.categories.models import Category
from src.courses.models import Course
from src.deliverables.models import Deliverable
from src.exceptions import NotFoundError


def _analyze_course(db: Session, course: Course) -> dict:
    """Por cada categoría de la materia: promedio de lo ya calificado * su peso,
    y suma esos puntos. Las categorías sin ninguna calificación no cuentan aún."""
    categories = list(
        db.scalars(select(Category).where(Category.course_id == course.id)).all()
    )
    deliverables = list(
        db.scalars(
            select(Deliverable).where(Deliverable.course_id == course.id)
        ).all()
    )

    current_grade = 0.0
    evaluated_percentage = 0
    categories_out: list[dict] = []

    for c in categories:
        items = [d for d in deliverables if d.category_id == c.id]
        graded = [d for d in items if d.grade is not None]
        percentage = int(c.percentage)

        if not graded:
            # Se muestra pero no suma.
            categories_out.append(
                {
                    "category_id": c.id,
                    "name": c.name,
                    "percentage": percentage,
                    "average": None,
                    "points": 0.0,
                    "graded_count": 0,
                    "total_count": len(items),
                }
            )
            continue

        # Pesos = 1 por ahora.
        # FUTURO: average = sum(d.grade * d.weight) / sum(d.weight)
        average = sum(d.grade for d in graded) / len(graded)
        points = average * (percentage / 100)

        current_grade += points
        evaluated_percentage += percentage

        categories_out.append(
            {
                "category_id": c.id,
                "name": c.name,
                "percentage": percentage,
                "average": round(average, 2),
                "points": round(points, 2),
                "graded_count": len(graded),
                "total_count": len(items),
            }
        )

    return {
        "course_id": course.id,
        "course_name": course.name,
        "current_grade": round(current_grade, 2),
        "evaluated_percentage": evaluated_percentage,
        "categories": categories_out,
    }


def analyze_course(db: Session, course_id: int, user_id: int) -> dict:
    course = db.get(Course, course_id)
    if course is None or course.user_id != user_id:
        raise NotFoundError(f"Materia con id {course_id} no encontrada")
    return _analyze_course(db, course)


def analyze_all(db: Session, user_id: int) -> list[dict]:
    stmt = select(Course).where(Course.user_id == user_id)
    return [_analyze_course(db, c) for c in db.scalars(stmt).all()]
