from pydantic import BaseModel, ConfigDict, Field, model_validator

from src.categories.schemas import CategoryCreate, CategoryOut


class CourseBase(BaseModel):
    name: str


class CourseCreate(CourseBase):
    # Las categorías van anidadas para crear la materia completa en una llamada.
    categories: list[CategoryCreate] = Field(default_factory=list)

    @model_validator(mode="after")
    def _percentages_sum_100(self) -> CourseCreate:
        if self.categories:
            total = sum(c.percentage for c in self.categories)
            if total != 100:
                raise ValueError(
                    f"La suma de porcentajes de las categorías debe ser 100 (es {total})"
                )
        return self


class CourseOut(CourseBase):
    id: int  # agregamos el id pues es algo que recuperamos de la base de datos
    model_config = ConfigDict(from_attributes=True)


class CourseWithCategoriesOut(CourseOut):
    # Respuesta de POST /courses: incluye las categorías recién creadas.
    categories: list[CategoryOut] = []
