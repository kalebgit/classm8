"""Cliente de Google Classroom para un usuario ya conectado.

Reconstruye unas `Credentials` de OAuth2 a partir del refresh_token cifrado que
guardamos y llama a la API con `google-api-python-client`. El refresh del
access_token lo hace la librería sola.
"""

from __future__ import annotations

from datetime import UTC, datetime

from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from src.auth.models import User
from src.classroom import security
from src.classroom.constants import (
    CLASSROOM_SCOPES,
    COURSE_STATE_ACTIVE,
    COURSEWORK_STATE_PUBLISHED,
    GOOGLE_TOKEN_URI,
)
from src.classroom.exceptions import (
    ClassroomAPIError,
    ClassroomNotConnectedError,
)
from src.config import settings


def _credentials(user: User) -> Credentials:
    if not user.classroom_refresh_token:
        raise ClassroomNotConnectedError("Classroom no está conectado")
    return Credentials(
        token=None,
        refresh_token=security.decrypt(user.classroom_refresh_token),
        token_uri=GOOGLE_TOKEN_URI,
        client_id=settings.GOOGLE_CLIENT_ID,
        client_secret=settings.GOOGLE_CLIENT_SECRET,
        scopes=CLASSROOM_SCOPES,
    )


def _service(user: User):
    creds = _credentials(user)
    try:
        creds.refresh(GoogleRequest())
    except Exception as exc:
        raise ClassroomNotConnectedError(
            "La conexión con Classroom expiró, vuelve a conectarla"
        ) from exc
    # cache_discovery=False: evita escribir en disco dentro del contenedor.
    return build("classroom", "v1", credentials=creds, cache_discovery=False)


def _due_at(coursework: dict) -> datetime | None:
    """Combina dueDate (Y/M/D, UTC) + dueTime (H/M, UTC) en un datetime.
    Google los da por separado y ambos en UTC. Si falta la fecha, no hay
    entrega fija y el ítem no se puede importar."""
    date = coursework.get("dueDate")
    if not date:
        return None
    time = coursework.get("dueTime") or {}
    return datetime(
        year=date["year"],
        month=date["month"],
        day=date["day"],
        hour=time.get("hours", 23),
        minute=time.get("minutes", 59),
        tzinfo=UTC,
    )


def fetch_courses_with_coursework(user: User) -> list[dict]:
    """Devuelve los cursos ACTIVOS del alumno con su trabajo publicado que
    tiene fecha de entrega. Forma:
        [{ "id", "name", "coursework": [{ "id", "title", "due_at" }] }]
    """
    svc = _service(user)
    try:
        courses = (
            svc.courses()
            .list(studentId="me", courseStates=[COURSE_STATE_ACTIVE], pageSize=100)
            .execute()
            .get("courses", [])
        )
        result: list[dict] = []
        for course in courses:
            work = (
                svc.courses()
                .courseWork()
                .list(
                    courseId=course["id"],
                    courseWorkStates=[COURSEWORK_STATE_PUBLISHED],
                    pageSize=200,
                    orderBy="dueDate asc",
                )
                .execute()
                .get("courseWork", [])
            )
            items = [
                {
                    "id": w["id"],
                    "title": w.get("title", "(sin título)"),
                    "due_at": due,
                    "link": w.get("alternateLink"),
                }
                for w in work
                if (due := _due_at(w)) is not None
            ]
            if items:
                result.append(
                    {
                        "id": course["id"],
                        "name": course.get("name", "(sin nombre)"),
                        "coursework": items,
                    }
                )
        return result
    except HttpError as exc:
        raise ClassroomAPIError(
            f"Google Classroom respondió {exc.status_code}"
        ) from exc
