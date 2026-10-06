"""Create the map point-of-interest tables when they are missing.

They used to be created only by ``scripts/import_map_data.py`` (``db.create_all``),
so on a fresh database ``/api/v1/*`` failed until the import was run. Existing
databases already have them and are left untouched.

Revision ID: e5b8d3f9a2c4
Revises: d4a7c2e8f1b6
"""

import sqlalchemy as sa
from alembic import op


revision = 'e5b8d3f9a2c4'
down_revision = 'd4a7c2e8f1b6'
branch_labels = None
depends_on = None


def _position_columns():
    return [
        sa.Column('id', sa.BigInteger(), primary_key=True, autoincrement=False),
        sa.Column('lat', sa.Float(), nullable=False),
        sa.Column('lng', sa.Float(), nullable=False),
    ]


TABLES = {
    'stations': lambda: [
        *_position_columns(),
        sa.Column('name', sa.String(), nullable=True),
        sa.Column('cap', sa.Integer(), nullable=True),
        sa.Column('type', sa.String(), nullable=False),
    ],
    'bicycle_repair': lambda: [
        *_position_columns(),
        sa.Column('name', sa.String(), nullable=True),
        sa.Column('opening_hours', sa.String(), nullable=True),
        sa.Column('phone', sa.String(), nullable=True),
    ],
    'toilets': lambda: [
        *_position_columns(),
        sa.Column('fee', sa.Boolean(), nullable=True),
        sa.Column('openingHours', sa.String(), nullable=True),
        sa.Column('changingTable', sa.Boolean(), nullable=True),
    ],
    'bicycle_parkings': lambda: [
        *_position_columns(),
        sa.Column('covered', sa.Boolean(), nullable=True),
        sa.Column('indoor', sa.Boolean(), nullable=True),
        sa.Column('access', sa.String(), nullable=True),
        sa.Column('fee', sa.Boolean(), nullable=True),
        sa.Column('bicycleParking', sa.String(), nullable=True),
        sa.Column('surveillance', sa.Boolean(), nullable=True),
        sa.Column('capacity', sa.Integer(), nullable=True),
    ],
}


def upgrade():
    existing = set(sa.inspect(op.get_bind()).get_table_names())
    for table, columns in TABLES.items():
        if table in existing:
            continue
        op.create_table(table, *columns(), sa.Column('gh5', sa.String(), nullable=False))
        op.create_index(f'ix_{table}_gh5', table, ['gh5'])


def downgrade():
    # The tables may predate this migration (created by the import script): keep the data.
    pass
