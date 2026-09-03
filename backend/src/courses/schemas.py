from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from src.categories.schemas import CategoryCreate, CategoryOut

RoundingMethod = Literal["trunc", "ceil", "half_up", "half_up_strict"]


class CourseBase(BaseModel):
    name: str


class CourseCreate(CourseBase):
    # Las categorías van anidadas para crear la materia completa en una llamada.
    categories: list[CategoryCreate] = Field(default_factory=list)

    @model_validator(mode="after")
    def _percentages_sum_at_least_100(self) -> CourseCreate:
        # La suma debe ser >= 100 (permite criterios con puntos extra), pero no
        # menos: una materia con categorías que no cubren el 100% está mal
        # definida.
        if self.categories:
            total = sum(c.percentage for c in self.categories)
            if total < 100:
                raise ValueError(
                    f"La suma de porcentajes debe ser al menos 100 (es {total})"
                )
        return self


class CourseUpdate(BaseModel):
    # Body parcial para PATCH /courses/{id}. Las categorías se editan una a una
    # con los endpoints /categories.
    name: str | None = None
    # Ajustes de la pestaña Análisis:
    extra_points: int | None = Field(default=None, ge=0, le=5)
    rounding_enabled: bool | None = None
    rounding_method: RoundingMethod | None = None


class CourseOut(CourseBase):
    id: int
    extra_points: int = 0
    rounding_enabled: bool = True
    rounding_method: RoundingMethod = "half_up"
    model_config = ConfigDict(from_attributes=True)


class CourseWithCategoriesOut(CourseOut):
    # Respuesta de POST /courses: incluye las categorías recién creadas.
    categories: list[CategoryOut] = []
