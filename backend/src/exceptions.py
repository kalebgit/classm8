class DomainError(Exception):
    """Base para todos los errores de negocio. NO hereda de HTTPException:
    la capa de servicio no debe saber nada de HTTP."""

    pass


class NotFoundError(DomainError):
    """Un recurso no existe."""

    pass


class ConflictError(DomainError):
    """El estado actual impide la operación (ej. recurso duplicado)."""

    pass
