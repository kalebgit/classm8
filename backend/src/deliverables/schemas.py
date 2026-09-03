from datetime import datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


class DeliverableStatus(str, Enum):
    pending = "pending"  # submitted_at IS NULL
    submitted = "submitted"  # submitted_at != NULL y grade IS NULL
    graded = "graded"  # grade != NULL


class DeliverableBase(BaseModel):
    name: str
    due_date: datetime
    course_id: int
    category_id: int
    previous_phase_id: int | None = None


class DeliverableCreate(DeliverableBase):
    pass


class DeliverableUpdate(BaseModel):
    # Body parcial para PATCH /deliverables/{id}.
    name: str | None = None
    due_date: datetime | None = None
    submitted_at: datetime | None = None
    # 0-150: deja margen para puntos extra por criterio.
    grade: int | None = Field(default=None, ge=0, le=150)
    category_id: int | None = None
    previous_phase_id: int | None = None


class DeliverableOut(BaseModel):
    # El GET/POST resuelven course_name y category_name por JOIN
    # para que el front no haga llamadas extra.
    id: int
    name: str
    due_date: datetime
    submitted_at: datetime | None
    grade: int | None
    course_id: int
    course_name: str
    category_id: int
    category_name: str
    previous_phase_id: int | None
    model_config = ConfigDict(from_attributes=True)
