from pydantic import BaseModel, ConfigDict, Field

from src.categories.schemas import CategoryCreate, CategoryOut


class CourseBase(BaseModel):
    name: str


class CourseCreate(CourseBase):
    # Las categorías van anidadas para crear la materia completa en una llamada.
    # NO se exige que sumen 100: algunos criterios de evaluación reparten más de
    # 100 (categorías con puntos extra). Cada porcentaje sigue siendo 0-100.
    categories: list[CategoryCreate] = Field(default_factory=list)


class CourseOut(CourseBase):
    id: int  # agregamos el id pues es algo que recuperamos de la base de datos
    model_config = ConfigDict(from_attributes=True)


class CourseWithCategoriesOut(CourseOut):
    # Respuesta de POST /courses: incluye las categorías recién creadas.
    categories: list[CategoryOut] = []
