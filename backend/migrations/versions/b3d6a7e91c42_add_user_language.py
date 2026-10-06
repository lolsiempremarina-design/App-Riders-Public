"""Store each user's interface language.

Revision ID: b3d6a7e91c42
Revises: 9f1c2d3e4a5b
"""

import sqlalchemy as sa
from alembic import op


revision = 'b3d6a7e91c42'
down_revision = '9f1c2d3e4a5b'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'user',
        sa.Column('language', sa.String(length=2), nullable=False, server_default='en'),
    )


def downgrade():
    op.drop_column('user', 'language')
