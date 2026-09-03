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
# scopes de Classroom.
oauth = OAuth()
oauth.register(
    name="google_classroom",
    client_id=settings.GOOGLE_CLIENT_ID,
    client_secret=settings.GOOGLE_CLIENT_SECRET,
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={"scope": " ".join(CLASSROOM_SCOPES)},
)


@router.get("/connect")
async def connect(request: Request, current_user: CurrentUser):
    """El front manda aquí el navegador entero. Guardamos el id del usuario en
    la sesión de Starlette para recuperarlo en el callback.

    `access_type=offline` + `prompt=consent` van AQUÍ (en la URL de
    autorización), no en client_kwargs: Google solo emite refresh_token si
    estos parámetros llegan en la petición /o/oauth2/v2/auth."""
    request.session["classroom_connect_uid"] = current_user.id
    resp = await oauth.google_classroom.authorize_redirect(
        request,
        settings.GOOGLE_CLASSROOM_REDIRECT_URI,
        access_type="offline",
        prompt="consent",
        include_granted_scopes="true",
    )
    logger.info("classroom /connect -> %s", resp.headers.get("location"))
    return resp


def _fail(reason: str) -> RedirectResponse:
    # Deja rastro de POR QUÉ falló el connect; el front solo ve ?classroom=error.
    logger.warning("classroom connect falló: %s", reason)
    return RedirectResponse(
        f"{settings.FRONTEND_CLASSROOM_RETURN_URL}?classroom=error"
    )


@router.get("/callback")
async def callback(request: Request, db: dbSession):
    uid = request.session.pop("classroom_connect_uid", None)

    if err := request.query_params.get("error"):
        return _fail(f"google devolvió ?error={err!r}")

    try:
        token = await oauth.google_classroom.authorize_access_token(request)
    except Exception as exc:  # noqa: BLE001 - state inválido, code caducado, etc.
        return _fail(f"authorize_access_token: {type(exc).__name__}: {exc}")

    logger.info(
        "callback token: scopes=%r refresh_token=%s",
        token.get("scope"),
        "sí" if token.get("refresh_token") else "NO",
    )

    refresh_token = token.get("refresh_token")
    user = auth_service.get_user(db, uid) if uid else None
    if user is None:
        return _fail(f"usuario no recuperado de la sesión (uid={uid!r})")

    if not refresh_token:
        # Google no reemite refresh_token si ya hay una concesión vigente para
        # esta app. Si el usuario ya tenía uno guardado, seguimos con ese.
        if user.classroom_refresh_token:
            logger.info(
                "callback sin refresh_token nuevo; se conserva el guardado "
                "(user_id=%s)",
                user.id,
            )
            return RedirectResponse(
                f"{settings.FRONTEND_CLASSROOM_RETURN_URL}?classroom=connected"
            )
        # No hay ninguno: el usuario debe revocar el acceso en
        # myaccount.google.com/permissions y reconectar para que Google lo emita.
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
