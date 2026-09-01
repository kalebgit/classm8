from typing import Annotated
from pydantic import BaseModel, ConfigDict


class CourseBase(BaseModel):
    name: str


class CourseCreate(CourseBase):
    pass


class CourseOut(CourseBase):
    id: int  # agregamos el id pues es algo que recuperamos de la base de datos
    model_config = ConfigDict(from_attributes=True)
