from sqlalchemy import select
from sqlalchemy.orm import Session

from src.categories import models, schemas
from src.courses.models import Course
from src.exceptions import NotFoundError


def _get_course_or_404(db: Session, course_id: int) -> Course:
    course = db.get(Course, course_id)
    if course is None:
        raise NotFoundError(f"Materia con id {course_id} no encontrada")
    return course


def get_category(db: Session, id: int) -> models.Category:
    category = db.get(models.Category, id)
    if category is None:
        raise NotFoundError(f"Categoría con id {id} no encontrada")
    return category


def list_categories(db: Session, course_id: int) -> list[models.Category]:
    _get_course_or_404(db, course_id)
    stmt = select(models.Category).where(models.Category.course_id == course_id)
    return list(db.scalars(stmt).all())


def create_category(
    db: Session, course_id: int, category_in: schemas.CategoryCreate
) -> models.Category:
    _get_course_or_404(db, course_id)
    category = models.Category(course_id=course_id, **category_in.model_dump())
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


def update_category(
    db: Session, id: int, category_in: schemas.CategoryUpdate
) -> models.Category:
    category = get_category(db, id)
    for field, value in category_in.model_dump(exclude_unset=True).items():
        setattr(category, field, value)
    db.commit()
    db.refresh(category)
    return category


def delete_category(db: Session, id: int) -> None:
    category = get_category(db, id)
    db.delete(category)
    db.commit()
