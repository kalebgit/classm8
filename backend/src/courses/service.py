import logging

from sqlalchemy import select
from sqlalchemy.orm import Session

from src.categories.models import Category
from src.courses import models, schemas
from src.exceptions import NotFoundError

logger = logging.getLogger("classm8.courses")


def get_courses(db: Session, user_id: int) -> list[models.Course]:
    stmt = select(models.Course).where(models.Course.user_id == user_id)
    return list(db.scalars(stmt).all())


def get_course(db: Session, id: int, user_id: int) -> models.Course:
    course = db.get(models.Course, id)
    # 404 (no 403) si es de otro usuario: no revelamos que existe.
    if course is None or course.user_id != user_id:
        raise NotFoundError(f"Materia con id {id} no encontrada")
    return course


def create_course(
    db: Session, course_in: schemas.CourseCreate, user_id: int
) -> models.Course:
    course = models.Course(
        name=course_in.name,
        user_id=user_id,
        categories=[
            Category(name=c.name, percentage=c.percentage)
            for c in course_in.categories
        ],
    )
    db.add(course)
    db.commit()
    db.refresh(course)
    return course


def update_course(
    db: Session, id: int, course_in: schemas.CourseUpdate, user_id: int
) -> models.Course:
    course = get_course(db, id, user_id)
    changes = course_in.model_dump(exclude_unset=True)
    logger.info(
        "PATCH course %s (user %s): %s -> %s",
        id,
        user_id,
        course.name,
        changes,
    )
    for field, value in changes.items():
        setattr(course, field, value)
    db.commit()
    db.refresh(course)
    logger.info("course %s ahora se llama %r", id, course.name)
    return course


def delete_course(db: Session, id: int, user_id: int) -> None:
    course = get_course(db, id, user_id)
    db.delete(course)  # cascada -> categorías y entregables
    db.commit()
