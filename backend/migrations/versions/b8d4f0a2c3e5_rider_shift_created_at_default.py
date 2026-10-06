"""Give rider_shifts.created_at a database default.

The GPS worker inserts rider shifts with plain SQL and never sets
``created_at``; without a server default every insert failed with a NOT NULL
violation and no route was ever saved.

Revision ID: b8d4f0a2c3e5
Revises: a7c3e9f1b2d4
"""

import sqlalchemy as sa
from alembic import op


revision = 'b8d4f0a2c3e5'
down_revision = 'a7c3e9f1b2d4'
branch_labels = None
depends_on = None


def upgrade():
    # Stored as naive UTC, like the ORM default (datetime.now(timezone.utc)).
    op.alter_column(
        'rider_shifts', 'created_at',
        existing_type=sa.DateTime(), existing_nullable=False,
        server_default=sa.text("(now() at time zone 'utc')"),
    )


def downgrade():
    op.alter_column(
        'rider_shifts', 'created_at',
        existing_type=sa.DateTime(), existing_nullable=False, server_default=None,
    )
