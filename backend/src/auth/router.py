from authlib.integrations.starlette_client import OAuth
from fastapi import APIRouter, Request
from fastapi.responses import RedirectResponse

from src.auth import service
from src.auth.dependencies import CurrentUser
from src.auth.schemas import UserOut
from src.auth.security import create_session_token
from src.config import settings
from src.dependencies import dbSession

router = APIRouter(prefix="/auth", tags=["auth"])

# Authlib descubre los endpoints de Google (authorize, token, jwks) leyendo el
# documento OpenID Connect. No hay que hardcodear URLs.
oauth = OAuth()
oauth.register(
    name="google",
    client_id=settings.GOOGLE_CLIENT_ID,
    client_secret=settings.GOOGLE_CLIENT_SECRET,
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={"scope": "openid email profile"},
)


@router.get("/google/login")
async def google_login(request: Request):
    """Paso 1: redirige el navegador a la pantalla de consentimiento de Google.
    Authlib genera y guarda el `state` (anti-CSRF) en la sesión de Starlette."""
    return await oauth.google.authorize_redirect(
        request, settings.GOOGLE_REDIRECT_URI
    )


@router.get("/google/callback")
async def google_callback(request: Request, db: dbSession):
    """Paso 2: Google vuelve aquí con `?code=...&state=...`. Authlib valida el
    state, canjea el code por tokens y verifica la firma del id_token."""
    try:
        token = await oauth.google.authorize_access_token(request)
    except Exception:  # noqa: BLE001 - state inválido, code caducado, red caída,
        # id_token mal firmado... cualquier fallo -> mandamos a la página de error.
        return RedirectResponse(settings.FRONTEND_LOGIN_FAILURE_URL)

    claims = token.get("userinfo")  # id_token decodificado y verificado
    if not claims or not claims.get("email_verified", True):
        return RedirectResponse(settings.FRONTEND_LOGIN_FAILURE_URL)

    user = service.upsert_google_user(db, claims)
    session_jwt = create_session_token(user.id)

    resp = RedirectResponse(settings.FRONTEND_LOGIN_SUCCESS_URL)
    resp.set_cookie(
        settings.SESSION_COOKIE_NAME,
        session_jwt,
        max_age=settings.JWT_EXPIRE_MINUTES * 60,
        httponly=True,  # inaccesible desde JS -> mitiga XSS
        secure=settings.COOKIE_SECURE,  # solo HTTPS en prod
        samesite="lax",
        domain=settings.SESSION_COOKIE_DOMAIN,
        path="/",
    )
    return resp


@router.get("/me", response_model=UserOut)
def me(current_user: CurrentUser):
    """El front llama a esto al arrancar para saber si hay sesión y de quién."""
    return current_user


@router.post("/logout")
def logout():
    resp = RedirectResponse(settings.FRONTEND_LOGIN_SUCCESS_URL, status_code=303)
    resp.delete_cookie(
        settings.SESSION_COOKIE_NAME,
        domain=settings.SESSION_COOKIE_DOMAIN,
        path="/",
    )
    return resp
