from src.exceptions import DomainError


class ClassroomNotConnectedError(DomainError):
    """El usuario todavía no autorizó el acceso a Google Classroom.
    Se mapea a HTTP 428 (Precondition Required) en src/main.py: el front debe
    mandar al usuario a /classroom/connect."""


class ClassroomAPIError(DomainError):
    """Google Classroom devolvió un error (token revocado, cuota, red).
    Se mapea a HTTP 502."""
