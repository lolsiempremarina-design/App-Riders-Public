"""Add opt-in preferences for sensor use and group location sharing.

Revision ID: e8a1c4d6f209
Revises: d4f7a2c8e901
"""

import sqlalchemy as sa
from alembic import op


revision = 'e8a1c4d6f209'
down_revision = 'd4f7a2c8e901'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'user',
        sa.Column('sensors_enabled', sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        'user',
        sa.Column('share_location_with_groups', sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade():
    op.drop_column('user', 'share_location_with_groups')
    op.drop_column('user', 'sensors_enabled')
