from __future__ import annotations

from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.database import Base

if TYPE_CHECKING:
    from src.courses.models import Course
    from src.deliverables.models import Deliverable


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    # Porcentaje que esta categoría aporta a la calificación de la materia: 0-100.
    percentage: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    course_id: Mapped[int] = mapped_column(
        ForeignKey("courses.id", ondelete="CASCADE"), nullable=False, index=True
    )

    course: Mapped[Course] = relationship(back_populates="categories")
    deliverables: Mapped[list[Deliverable]] = relationship(
        back_populates="category",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    __table_args__ = (
        CheckConstraint(
            "percentage >= 0 AND percentage <= 100", name="ck_category_pct_range"
        ),
    )
