"""quitar el tope de 100 en deliverables.grade

Algunos criterios de evaluación permiten pasar de 100 (puntos extra / bonus).
Se conserva el piso: grade >= 0.

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-09-03 12:00:00.000000

"""
from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = 'b2c3d4e5f6a7'
down_revision: str | Sequence[str] | None = 'a1b2c3d4e5f6'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.drop_constraint(
        'ck_deliverable_grade_range', 'deliverables', type_='check'
    )
    op.create_check_constraint(
        'ck_deliverable_grade_range',
        'deliverables',
        'grade IS NULL OR grade >= 0',
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint(
        'ck_deliverable_grade_range', 'deliverables', type_='check'
    )
    op.create_check_constraint(
        'ck_deliverable_grade_range',
        'deliverables',
        'grade IS NULL OR (grade >= 0 AND grade <= 100)',
    )
