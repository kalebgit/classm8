from sqlalchemy import select
from sqlalchemy.orm import Session

from src.categories.models import Category
from src.courses import models, schemas
from src.exceptions import NotFoundError


def get_courses(db: Session) -> list[models.Course]:
    return list(db.scalars(select(models.Course)).all())


def get_course(db: Session, id: int) -> models.Course:
    course = db.get(models.Course, id)
    if course is None:
        raise NotFoundError(f"Materia con id {id} no encontrada")
    return course


def create_course(db: Session, course_in: schemas.CourseCreate) -> models.Course:
    course = models.Course(
        name=course_in.name,
        categories=[
            Category(name=c.name, percentage=c.percentage)
            for c in course_in.categories
        ],
    )
    db.add(course)
    db.commit()
    db.refresh(course)
    return course


def delete_course(db: Session, id: int) -> None:
    course = get_course(db, id)
    db.delete(course)  # cascada -> categorías y entregables
    db.commit()
