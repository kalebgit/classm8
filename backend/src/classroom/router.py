"""Endpoints de la integración con Google Classroom.

- GET  /classroom/connect   -> arranca el consentimiento extra (scopes Classroom)
- GET  /classroom/callback   -> Google vuelve aquí; guardamos el refresh_token
- GET  /classroom/scan       -> árbol cursos/coursework para el modal de importar
- POST /classroom/import     -> crea materias/entregables según el mapeo del modal
- DELETE /classroom/connection -> olvida el refresh_token
"""

from authlib.integrations.starlette_client import OAuth
from fastapi import APIRouter, Request
from fastapi.responses import RedirectResponse

from src.auth.dependencies import CurrentUser
from src.classroom import schemas, service
from src.classroom.constants import CLASSROOM_SCOPES
from src.config import settings
from src.dependencies import dbSession

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


@router.get("/callback")
async def callback(request: Request, db: dbSession):
    uid = request.session.pop("classroom_connect_uid", None)
    try:
        token = await oauth.google_classroom.authorize_access_token(request)
    except Exception:  # noqa: BLE001 - state inválido, code caducado, etc.
        return RedirectResponse(
            f"{settings.FRONTEND_CLASSROOM_RETURN_URL}?classroom=error"
        )

    refresh_token = token.get("refresh_token")
    from src.auth import service as auth_service

    user = auth_service.get_user(db, uid) if uid else None
    if user is None or not refresh_token:
        return RedirectResponse(
            f"{settings.FRONTEND_CLASSROOM_RETURN_URL}?classroom=error"
        )

    service.save_refresh_token(db, user, refresh_token)
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
