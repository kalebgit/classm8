from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.database import Base

if TYPE_CHECKING:
    from src.categories.models import Category
    from src.courses.models import Course


class Deliverable(Base):
    __tablename__ = "deliverables"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String, nullable=False)

    # Fecha (con hora) en que se debe entregar. Guardar siempre en UTC.
    due_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    # Fecha (con hora) en que realmente se entregó. Null mientras no se entrega.
    submitted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Calificación obtenida: 0 - 100 (entero). Null mientras no se califica.
    grade: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    course_id: Mapped[int] = mapped_column(
        ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True
    )
    category_id: Mapped[int] = mapped_column(
        ForeignKey("categories.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Fase anterior de este entregable (auto-referencia). Null si es la primera.
    previous_phase_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("deliverables.id", ondelete="SET NULL"), nullable=True
    )

    # se debe poner el nombre del atributo en la clase de python del otro lado
    course: Mapped[Course] = relationship(back_populates="deliverables")
    category: Mapped[Category] = relationship(back_populates="deliverables")
    previous_phase: Mapped[Deliverable | None] = relationship(
        remote_side=[id], backref="next_phases"
    )

    __table_args__ = (
        CheckConstraint(
            "grade IS NULL OR (grade >= 0 AND grade <= 100)",
            name="ck_deliverable_grade_range",
        ),
    )
