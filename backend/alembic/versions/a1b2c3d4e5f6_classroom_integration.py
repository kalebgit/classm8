"""classroom integration: refresh token en users, coursework_id en deliverables

Revision ID: a1b2c3d4e5f6
Revises: 5ca0168a8c18
Create Date: 2026-09-03 02:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = '5ca0168a8c18'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'users',
        sa.Column('classroom_refresh_token', sa.String(), nullable=True),
    )
    op.add_column(
        'deliverables',
        sa.Column('classroom_coursework_id', sa.String(), nullable=True),
    )
    op.create_index(
        op.f('ix_deliverables_classroom_coursework_id'),
        'deliverables',
        ['classroom_coursework_id'],
        unique=False,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(
        op.f('ix_deliverables_classroom_coursework_id'),
        table_name='deliverables',
    )
    op.drop_column('deliverables', 'classroom_coursework_id')
    op.drop_column('users', 'classroom_refresh_token')
