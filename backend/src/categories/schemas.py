from pydantic import BaseModel, ConfigDict, Field


class CategoryBase(BaseModel):
    name: str
    # Porcentaje que esta categoría aporta a la calificación de la materia: 0-100.
    percentage: int = Field(ge=0, le=100)


class CategoryCreate(CategoryBase):
    pass


class CategoryUpdate(BaseModel):
    # Body parcial para PATCH /categories/{id}.
    name: str | None = None
    percentage: int | None = Field(default=None, ge=0, le=100)


class CategoryOut(CategoryBase):
    id: int
    course_id: int
    model_config = ConfigDict(from_attributes=True)
