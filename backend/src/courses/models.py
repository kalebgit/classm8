from __future__ import annotations

from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    ForeignKey,
    Integer,
    Numeric,
    String,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.database import Base

if TYPE_CHECKING:
    from src.categories.models import Category
    from src.deliverables.models import Deliverable

# Métodos de redondeo de la calificación final (escala 0-10) en el análisis.
ROUNDING_METHODS = ("trunc", "ceil", "half_up", "half_up_strict")


class Course(Base):
    __tablename__ = "courses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    # Dueño de la materia. Todo lo que cuelga (categorías, entregables) es suyo.
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # --- ajustes de la pestaña Análisis (escala 0-10) ---
    # Puntos extra (0.00 - 5.00, decimales) que se SUMAN tal cual a la
    # calificación de la materia en escala 0-10, antes de redondear.
    extra_points: Mapped[Decimal] = mapped_column(
        Numeric(3, 2), nullable=False, server_default="0"
    )
    # ¿Se redondea la calificación final de la materia?
    rounding_enabled: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default="1"
    )
    # Cómo se redondea: trunc | ceil | half_up (>=.5) | half_up_strict (>.5)
    rounding_method: Mapped[str] = mapped_column(
        String, nullable=False, server_default="half_up"
    )

    categories: Mapped[list[Category]] = relationship(
        back_populates="course",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    deliverables: Mapped[list[Deliverable]] = relationship(
        back_populates="course",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    __table_args__ = (
        CheckConstraint(
            "extra_points >= 0 AND extra_points <= 5",
            name="ck_course_extra_points",
        ),
        CheckConstraint(
            "rounding_method IN ('trunc', 'ceil', 'half_up', 'half_up_strict')",
            name="ck_course_rounding_method",
        ),
    )
