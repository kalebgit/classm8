from pydantic import BaseModel, ConfigDict, Field, computed_field


class UserOut(BaseModel):
    id: int
    email: str
    name: str | None
    picture: str | None
    # Se lee del ORM pero no se expone en el JSON; solo alimenta el flag de abajo.
    classroom_refresh_token: str | None = Field(default=None, exclude=True)
    model_config = ConfigDict(from_attributes=True)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def classroom_connected(self) -> bool:
        """True si el usuario ya autorizó el acceso a Google Classroom.
        El front usa esto para decidir si el botón 'Classroom' escanea o
        primero pide conectar."""
        return self.classroom_refresh_token is not None
