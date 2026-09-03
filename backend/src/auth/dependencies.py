from typing import Annotated

from fastapi import Depends, Request

from src.auth import service
from src.auth.exceptions import AuthError
from src.auth.models import User
from src.auth.security import decode_session_token
from src.config import settings
from src.dependencies import dbSession


def get_current_user(request: Request, db: dbSession) -> User:
    token = request.cookies.get(settings.SESSION_COOKIE_NAME)
    if not token:
        raise AuthError("No hay sesión")
    try:
        user_id = decode_session_token(token)
    except Exception as exc:  # firma inválida / token expirado / malformado
        raise AuthError("Sesión inválida") from exc
    user = service.get_user(db, user_id)
    if user is None:
        raise AuthError("Usuario no encontrado")
    return user


# Úsala en cualquier endpoint que requiera login:
#   def list_courses(db: dbSession, current_user: CurrentUser): ...
CurrentUser = Annotated[User, Depends(get_current_user)]
