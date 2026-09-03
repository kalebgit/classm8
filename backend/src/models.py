"""Agregador de modelos.

Importa aquí TODAS las clases de modelo para que:
1. SQLAlchemy pueda resolver las relaciones cruzadas (back_populates,
   relationship("Category"), etc.) que se configuran de forma perezosa: basta
   con importar este módulo una vez (en src/main.py) antes de la primera request.
2. Alembic las descubra por Base.metadata al hacer `revision --autogenerate`
   (env.py hace `import src.models`).

No define nada nuevo, solo reexporta.
"""

from src.auth.models import User
from src.categories.models import Category
from src.courses.models import Course
from src.deliverables.models import Deliverable

__all__ = ["Category", "Course", "Deliverable", "User"]
