from sqlalchemy import select
from sqlalchemy.orm import Session
from src.courses import models, schemas
from src.exceptions import NotFoundError


def get_courses(db: Session) -> list[models.Course]:
    return list(db.scalars(select(models.Course)).all())


def get_course(db: Session, id: int) -> models.Course:
    course = db.get(models.Course, id)
    if course is None:
        raise NotFoundError(f"Usuario con {id} no encontrado")
    return course


def create_course(db: Session, course_in: schemas.CourseCreate):
    course = models.Course(**course_in.model_dump())
    db.add(course)
    db.commit()
    db.refresh(course)
    return course
