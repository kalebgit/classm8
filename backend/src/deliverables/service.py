from sqlalchemy import select
from sqlalchemy.orm import Session

from src.categories.models import Category
from src.courses.models import Course
from src.deliverables import models, schemas
from src.deliverables.schemas import DeliverableStatus
from src.exceptions import NotFoundError


def _row_to_out(
    deliverable: models.Deliverable, course_name: str, category_name: str
) -> dict:
    return {
        "id": deliverable.id,
        "name": deliverable.name,
        "due_date": deliverable.due_date,
        "submitted_at": deliverable.submitted_at,
        "grade": deliverable.grade,
        "course_id": deliverable.course_id,
        "course_name": course_name,
        "category_id": deliverable.category_id,
        "category_name": category_name,
        "previous_phase_id": deliverable.previous_phase_id,
    }


def _select_with_names(user_id: int):
    # Una sola query resuelve course_name y category_name (JOIN) y filtra por
    # dueño.
    return (
        select(models.Deliverable, Course.name, Category.name)
        .join(Course, Course.id == models.Deliverable.course_id)
        .join(Category, Category.id == models.Deliverable.category_id)
        .where(models.Deliverable.user_id == user_id)
    )


def _validate_refs(
    db: Session, course_id: int, category_id: int, user_id: int
) -> None:
    course = db.get(Course, course_id)
    if course is None or course.user_id != user_id:
        raise NotFoundError(f"Materia con id {course_id} no encontrada")
    category = db.get(Category, category_id)
    if category is None:
        raise NotFoundError(f"Categoría con id {category_id} no encontrada")
    if category.course_id != course_id:
        raise NotFoundError(
            f"La categoría {category_id} no pertenece a la materia {course_id}"
        )


def list_deliverables(
    db: Session,
    user_id: int,
    status: DeliverableStatus | None = None,
    course_id: int | None = None,
) -> list[dict]:
    stmt = _select_with_names(user_id)
    if course_id is not None:
        stmt = stmt.where(models.Deliverable.course_id == course_id)
    if status == DeliverableStatus.pending:
        stmt = stmt.where(models.Deliverable.submitted_at.is_(None))
    elif status == DeliverableStatus.submitted:
        stmt = stmt.where(
            models.Deliverable.submitted_at.is_not(None),
            models.Deliverable.grade.is_(None),
        )
    elif status == DeliverableStatus.graded:
        stmt = stmt.where(models.Deliverable.grade.is_not(None))
    return [
        _row_to_out(d, c_name, cat_name)
        for d, c_name, cat_name in db.execute(stmt).all()
    ]


def get_deliverable(db: Session, id: int, user_id: int) -> dict:
    stmt = _select_with_names(user_id).where(models.Deliverable.id == id)
    row = db.execute(stmt).first()
    if row is None:
        raise NotFoundError(f"Entregable con id {id} no encontrado")
    d, c_name, cat_name = row
    return _row_to_out(d, c_name, cat_name)


def create_deliverable(
    db: Session, deliverable_in: schemas.DeliverableCreate, user_id: int
) -> dict:
    _validate_refs(
        db, deliverable_in.course_id, deliverable_in.category_id, user_id
    )
    deliverable = models.Deliverable(
        **deliverable_in.model_dump(), user_id=user_id
    )
    db.add(deliverable)
    db.commit()
    db.refresh(deliverable)
    return get_deliverable(db, deliverable.id, user_id)


def update_deliverable(
    db: Session, id: int, deliverable_in: schemas.DeliverableUpdate, user_id: int
) -> dict:
    deliverable = db.get(models.Deliverable, id)
    if deliverable is None or deliverable.user_id != user_id:
        raise NotFoundError(f"Entregable con id {id} no encontrado")
    for field, value in deliverable_in.model_dump(exclude_unset=True).items():
        setattr(deliverable, field, value)
    db.commit()
    return get_deliverable(db, id, user_id)


def delete_deliverable(db: Session, id: int, user_id: int) -> None:
    deliverable = db.get(models.Deliverable, id)
    if deliverable is None or deliverable.user_id != user_id:
        raise NotFoundError(f"Entregable con id {id} no encontrado")
    db.delete(deliverable)
    db.commit()
