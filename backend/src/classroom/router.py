"""Endpoints de la integración con Google Classroom.

- GET  /classroom/connect   -> arranca el consentimiento extra (scopes Classroom)
- GET  /classroom/callback   -> Google vuelve aquí; guardamos el refresh_token
- GET  /classroom/scan       -> árbol cursos/coursework para el modal de importar
- POST /classroom/import     -> crea materias/entregables según el mapeo del modal
- DELETE /classroom/connection -> olvida el refresh_token
"""

import logging

from authlib.integrations.starlette_client import OAuth
from fastapi import APIRouter, Request
from fastapi.responses import RedirectResponse

from src.auth import service as auth_service
from src.auth.dependencies import CurrentUser
from src.classroom import schemas, service
from src.classroom.constants import CLASSROOM_SCOPES
from src.config import settings
from src.dependencies import dbSession

logger = logging.getLogger("classm8.classroom")

router = APIRouter(prefix="/classroom", tags=["classroom"])

# Cliente OAuth separado del login: mismos client_id/secret, pero pide los
# scopes de Classroom y `access_type=offline` para recibir refresh_token.
oauth = OAuth()
oauth.register(
    name="google_classroom",
    client_id=settings.GOOGLE_CLIENT_ID,
    client_secret=settings.GOOGLE_CLIENT_SECRET,
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={
        "scope": " ".join(CLASSROOM_SCOPES),
        "access_type": "offline",  # -> refresh_token
        "prompt": "consent",  # fuerza refresh_token aunque ya haya consentido
        "include_granted_scopes": "true",  # autorización incremental
    },
)


@router.get("/connect")
async def connect(request: Request, current_user: CurrentUser):
    """El front manda aquí el navegador entero. Guardamos el id del usuario en
    la sesión de Starlette para recuperarlo en el callback."""
    request.session["classroom_connect_uid"] = current_user.id
    return await oauth.google_classroom.authorize_redirect(
        request, settings.GOOGLE_CLASSROOM_REDIRECT_URI
    )


def _fail(reason: str) -> RedirectResponse:
    logger.warning("classroom connect fallo: %s", reason)
    return RedirectResponse(
        f"{settings.FRONTEND_CLASSROOM_RETURN_URL}?classroom=error"
    )


def _granted_scopes(token: dict) -> set[str]:
    raw = token.get("scope", "")
    return set(raw.split()) if isinstance(raw, str) else set(raw or [])


@router.get("/callback")
async def callback(request: Request, db: dbSession):
    uid = request.session.pop("classroom_connect_uid", None)

    # Google puede volver con ?error=access_denied si el usuario canceló o si la
    # app no está autorizada para esos scopes.
    if err := request.query_params.get("error"):
        return _fail(f"google devolvió error={err!r}")

    try:
        token = await oauth.google_classroom.authorize_access_token(request)
    except Exception as exc:  # noqa: BLE001 - state inválido, code caducado, etc.
        return _fail(f"authorize_access_token: {type(exc).__name__}: {exc}")

    user = auth_service.get_user(db, uid) if uid else None
    if user is None:
        return _fail(f"no se recuperó el usuario de la sesión (uid={uid!r})")

    # Verifica que Google concedió el scope de coursework (el de leer tareas).
    # Si concedió otro (p.ej. student-submissions) el escaneo fallaría después.
    granted = _granted_scopes(token)
    needed = "https://www.googleapis.com/auth/classroom.coursework.me.readonly"
    if needed not in granted:
        return _fail(
            f"falta el scope de coursework; google concedió: {sorted(granted)}"
        )

    refresh_token = token.get("refresh_token")
    if not refresh_token:
        # Google no reemite refresh_token si ya hay una concesión vigente. Si el
        # usuario ya tenía uno guardado, seguimos usándolo. Si no, hay que
        # revocar el acceso en https://myaccount.google.com/permissions y
        # reconectar.
        if user.classroom_refresh_token:
            logger.info(
                "callback sin refresh_token nuevo; se conserva el guardado "
                "(user_id=%s)",
                user.id,
            )
            return RedirectResponse(
                f"{settings.FRONTEND_CLASSROOM_RETURN_URL}?classroom=connected"
            )
        return _fail(
            "sin refresh_token y no hay uno guardado; revoca el acceso en "
            "myaccount.google.com/permissions y reconecta"
        )

    service.save_refresh_token(db, user, refresh_token)
    logger.info("classroom conectado para user_id=%s", user.id)
    return RedirectResponse(
        f"{settings.FRONTEND_CLASSROOM_RETURN_URL}?classroom=connected"
    )


@router.get("/scan", response_model=schemas.ScanOut)
def scan(db: dbSession, current_user: CurrentUser):
    return service.scan(db, current_user)


@router.post("/import", response_model=schemas.ImportResult)
def import_coursework(
    req: schemas.ImportRequest, db: dbSession, current_user: CurrentUser
):
    return service.import_items(db, current_user, req)


@router.delete("/connection", status_code=204)
def disconnect(db: dbSession, current_user: CurrentUser):
    service.disconnect(db, current_user)
