from sqlalchemy.orm import Mapped, mapped_column, mapped_column
from sqlalchemy import Integer, String
from src.database import Base


class Course(Base):
    __tablename__ = "courses"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
