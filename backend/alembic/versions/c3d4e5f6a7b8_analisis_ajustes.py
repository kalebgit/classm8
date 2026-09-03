"""ajustes de analisis por materia + tope de grade a 150

- courses.extra_points (0-5), rounding_enabled (bool), rounding_method (str)
- deliverables.grade vuelve a tener tope: 0-150

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-09-03 22:00:00.000000

"""
from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c3d4e5f6a7b8"
down_revision: str | Sequence[str] | None = "b2c3d4e5f6a7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "courses",
        sa.Column(
            "extra_points",
            sa.Numeric(precision=3, scale=2),
            nullable=False,
            server_default="0",
        ),
    )
    op.add_column(
        "courses",
        sa.Column(
            "rounding_enabled",
            sa.Boolean(),
            nullable=False,
            server_default="1",
        ),
    )
    op.add_column(
        "courses",
        sa.Column(
            "rounding_method",
            sa.String(),
            nullable=False,
            server_default="half_up",
        ),
    )
    op.create_check_constraint(
        "ck_course_extra_points",
        "courses",
        "extra_points >= 0 AND extra_points <= 5",
    )
    op.create_check_constraint(
        "ck_course_rounding_method",
        "courses",
        "rounding_method IN ('trunc', 'ceil', 'half_up', 'half_up_strict')",
    )

    # grade: de "solo >= 0" a "0-150"
    op.drop_constraint(
        "ck_deliverable_grade_range", "deliverables", type_="check"
    )
    op.create_check_constraint(
        "ck_deliverable_grade_range",
        "deliverables",
        "grade IS NULL OR (grade >= 0 AND grade <= 150)",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint(
        "ck_deliverable_grade_range", "deliverables", type_="check"
    )
    op.create_check_constraint(
        "ck_deliverable_grade_range",
        "deliverables",
        "grade IS NULL OR grade >= 0",
    )
    op.drop_constraint("ck_course_rounding_method", "courses", type_="check")
    op.drop_constraint("ck_course_extra_points", "courses", type_="check")
    op.drop_column("courses", "rounding_method")
    op.drop_column("courses", "rounding_enabled")
    op.drop_column("courses", "extra_points")
