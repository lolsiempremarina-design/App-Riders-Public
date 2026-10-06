"""Allow OpenStreetMap IDs in map tables.

Revision ID: 9f1c2d3e4a5b
Revises: c51a9f0e42d1
"""

import sqlalchemy as sa
from alembic import op


revision = "9f1c2d3e4a5b"
down_revision = "c51a9f0e42d1"
branch_labels = None
depends_on = None

MAP_TABLES = ("stations", "toilets", "bicycle_repair", "bicycle_parkings")


def upgrade():
    connection = op.get_bind()
    inspector = sa.inspect(connection)
    for table in MAP_TABLES:
        if inspector.has_table(table):
            id_type = next(col["type"] for col in inspector.get_columns(table) if col["name"] == "id")
            if not isinstance(id_type, sa.BigInteger):
                op.alter_column(table, "id", existing_type=id_type, type_=sa.BigInteger())


def downgrade():
    connection = op.get_bind()
    inspector = sa.inspect(connection)
    for table in MAP_TABLES:
        if inspector.has_table(table):
            largest_id = connection.execute(sa.text(f'SELECT MAX(id) FROM "{table}"')).scalar()
            if largest_id is not None and largest_id > 2_147_483_647:
                raise RuntimeError(f"Cannot narrow {table}.id: existing IDs exceed INTEGER")
            op.alter_column(table, "id", existing_type=sa.BigInteger(), type_=sa.Integer())
