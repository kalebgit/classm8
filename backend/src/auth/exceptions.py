from src.exceptions import DomainError


class AuthError(DomainError):
    """No hay sesión válida (cookie ausente, JWT inválido o expirado, usuario
    inexistente). Se mapea a HTTP 401 en src/main.py."""

