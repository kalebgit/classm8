"""Lógica de la integración con Classroom: conectar, escanear e importar.

`escanear` = leer Classroom y devolver el árbol para que el usuario mapee en el
modal. `importar` = tomar ese mapeo ya resuelto y crear materias/entregables.
Todo lo que Classroom no da (categoría, tipo, fase) lo pone el usuario a mano;
la única cosa fija es la fecha de entrega.
"""

from __future__ import annotations

from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from src.auth.models import User
from src.categories.models import Category
from src.classroom import google, schemas, security
from src.classroom.exceptions import ClassroomNotConnectedError
from src.courses.models import Course
from src.deliverables.models import Deliverable
from src.exceptions import NotFoundError

# --- conectar / desconectar --------------------------------------------------


def save_refresh_token(db: Session, user: User, refresh_token: str) -> None:
    user.classroom_refresh_token = security.encrypt(refresh_token)
    db.commit()


def disconnect(db: Session, user: User) -> None:
    user.classroom_refresh_token = None
    db.commit()


def is_connected(user: User) -> bool:
    return user.classroom_refresh_token is not None


# --- escanear --------------------------------------------------------------


def scan(db: Session, user: User) -> schemas.ScanOut:
    if not is_connected(user):
        return schemas.ScanOut(connected=False)

    tree = google.fetch_courses_with_coursework(user)

    # qué coursework ya importó este usuario -> marcarlos en el resultado
    imported_ids = set(
        db.scalars(
            select(Deliverable.classroom_coursework_id).where(
                Deliverable.user_id == user.id,
                Deliverable.classroom_coursework_id.is_not(None),
            )
        ).all()
    )

    courses = [
        schemas.ScannedCourse(
            classroom_id=c["id"],
            name=c["name"],
            coursework=[
                schemas.ScannedCoursework(
                    classroom_id=w["id"],
                    title=w["title"],
                    due_at=w["due_at"],
                    link=w["link"],
                    already_imported=w["id"] in imported_ids,
                )
                for w in c["coursework"]
            ],
        )
        for c in tree
    ]
    return schemas.ScanOut(connected=True, courses=courses)


# --- importar ------------------------------------------------------------


def _resolve_course(
    db: Session, item: schemas.ImportItem, user_id: int, cache: dict[str, Course]
) -> tuple[Course, Category, bool]:
    """Devuelve (materia, categoría destino, materia_recién_creada?).

    - course_id -> materia existente + category_id que mandó el usuario.
    - new_course_name -> se crea la materia con una categoría "General" 100%.
      Materias nuevas repetidas en el mismo request se reutilizan (cache).
    """
    if item.course_id is not None:
        course = db.get(Course, item.course_id)
        if course is None or course.user_id != user_id:
            raise NotFoundError(
                f"Materia con id {item.course_id} no encontrada"
            )
        if item.category_id is None:
            raise NotFoundError(
                f"Falta la categoría para '{item.name}'"
            )
        category = db.get(Category, item.category_id)
        if category is None or category.course_id != course.id:
            raise NotFoundError(
                f"La categoría {item.category_id} no pertenece a la materia"
            )
        return course, category, False

    name = (item.new_course_name or "").strip()
    if not name:
        raise NotFoundError(
            f"'{item.name}' no indica materia destino ni nombre nuevo"
        )
    if name.lower() in cache:
        course = cache[name.lower()]
        return course, course.categories[0], False

    course = Course(
        name=name,
        user_id=user_id,
        categories=[Category(name="General", percentage=Decimal(100))],
    )
    db.add(course)
    db.flush()  # asigna course.id y category.id sin cerrar la transacción
    cache[name.lower()] = course
    return course, course.categories[0], True


def import_items(
    db: Session, user: User, req: schemas.ImportRequest
) -> schemas.ImportResult:
    if not is_connected(user):
        raise ClassroomNotConnectedError("Classroom no está conectado")

    already = set(
        db.scalars(
            select(Deliverable.classroom_coursework_id).where(
                Deliverable.user_id == user.id,
                Deliverable.classroom_coursework_id.is_not(None),
            )
        ).all()
    )

    new_courses = 0
    new_deliverables = 0
    skipped = 0
    course_cache: dict[str, Course] = {}

    for item in req.items:
        if item.classroom_coursework_id in already:
            skipped += 1
            continue

        course, category, created = _resolve_course(
            db, item, user.id, course_cache
        )
        if created:
            new_courses += 1

        db.add(
            Deliverable(
                name=item.name,
                due_date=item.due_date,
                course_id=course.id,
                category_id=category.id,
                user_id=user.id,
                classroom_coursework_id=item.classroom_coursework_id,
            )
        )
        already.add(item.classroom_coursework_id)
        new_deliverables += 1

    db.commit()
    return schemas.ImportResult(
        created_courses=new_courses,
        created_deliverables=new_deliverables,
        skipped=skipped,
    )
