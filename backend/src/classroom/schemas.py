from datetime import datetime

from pydantic import BaseModel, Field

# --- GET /classroom/scan : lo que Classroom trae, ya normalizado ---


class ScannedCoursework(BaseModel):
    classroom_id: str
    title: str
    due_at: datetime  # fija: viene de Classroom, el usuario no la edita
    link: str | None = None
    # True si ya existe un entregable importado de este coursework.
    already_imported: bool = False


class ScannedCourse(BaseModel):
    classroom_id: str
    name: str
    coursework: list[ScannedCoursework]


class ScanOut(BaseModel):
    connected: bool
    courses: list[ScannedCourse] = Field(default_factory=list)


# --- POST /classroom/import : el mapeo que resolvió el usuario en el modal ---


class ImportItem(BaseModel):
    classroom_coursework_id: str
    # El usuario puede renombrar; default en el front es el título de Classroom.
    name: str = Field(min_length=1)
    # Fecha fija de Classroom, la reenvía el front tal cual la recibió.
    due_date: datetime
    # A qué materia de classm8 va. Exactamente uno de los dos:
    course_id: int | None = None  # materia existente
    new_course_name: str | None = None  # crear materia nueva con este nombre
    # Categoría destino. Obligatoria si course_id (materia existente con
    # categorías). Para materia nueva se crea una categoría "General" al 100%.
    category_id: int | None = None


class ImportRequest(BaseModel):
    items: list[ImportItem] = Field(min_length=1)


class ImportResult(BaseModel):
    created_courses: int
    created_deliverables: int
    skipped: int  # ya estaban importados
