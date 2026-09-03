from datetime import UTC, datetime, timedelta

import jwt

from src.config import settings


def create_session_token(user_id: int) -> str:
    """Emite el JWT propio de classm8 (no el de Google). Va firmado con
    JWT_SECRET y caduca a los JWT_EXPIRE_MINUTES."""
    now = datetime.now(UTC)
    payload = {
        "sub": str(user_id),
        "iat": now,
        "exp": now + timedelta(minutes=settings.JWT_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALG)


def decode_session_token(token: str) -> int:
    """Verifica firma y expiración y devuelve el id del usuario.
    Lanza jwt.PyJWTError si el token no es válido."""
    data = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALG])
    return int(data["sub"])
