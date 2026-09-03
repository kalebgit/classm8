"""Cifrado del refresh_token de Google que guardamos en la DB.

Fernet (AES-128-CBC + HMAC) con la clave de `settings.FERNET_KEY`. Nunca
guardamos el token en claro: si se filtra la DB, sin la clave no sirve de nada.
"""

from cryptography.fernet import Fernet

from src.config import settings

_fernet = Fernet(settings.FERNET_KEY.encode())


def encrypt(plaintext: str) -> str:
    return _fernet.encrypt(plaintext.encode()).decode()


def decrypt(token: str) -> str:
    return _fernet.decrypt(token.encode()).decode()
