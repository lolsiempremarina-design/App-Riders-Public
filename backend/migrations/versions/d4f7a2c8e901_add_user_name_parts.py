"""Store first and last names separately for new registrations.

Revision ID: d4f7a2c8e901
Revises: b3d6a7e91c42
"""

import sqlalchemy as sa
from alembic import op


revision = 'd4f7a2c8e901'
down_revision = 'b3d6a7e91c42'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('user', sa.Column('first_name', sa.String(length=99), nullable=True))
    op.add_column('user', sa.Column('last_name', sa.String(length=99), nullable=True))


def downgrade():
    op.drop_column('user', 'last_name')
    op.drop_column('user', 'first_name')
