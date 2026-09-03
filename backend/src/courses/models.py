from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.database import Base

if TYPE_CHECKING:
    from src.categories.models import Category
    from src.deliverables.models import Deliverable


class Course(Base):
    __tablename__ = "courses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String, nullable=False)

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
