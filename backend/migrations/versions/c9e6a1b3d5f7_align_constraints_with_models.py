"""Align remaining constraints with the models.

- ``user`` identity fields are required by the model and by registration: make them
  NOT NULL where the data allows it (legacy rows with gaps are left untouched, with a
  warning, so the application can still start).
(The aggregate tables already enforce uniqueness with their primary keys, named
``uix_hourly_daily_date_hour`` / ``uix_monthly_year_month``: nothing to add there.)

Revision ID: c9e6a1b3d5f7
Revises: b8d4f0a2c3e5
"""

import logging

import sqlalchemy as sa
from alembic import op


revision = 'c9e6a1b3d5f7'
down_revision = 'b8d4f0a2c3e5'
branch_labels = None
depends_on = None

logger = logging.getLogger('alembic.runtime.migration')

USER_REQUIRED = {
    'tax_id_code': sa.String(length=16),
    'full_name': sa.String(length=200),
    'date_of_birth': sa.Date(),
    'gender': sa.String(length=1),
    'birth_city_country': sa.String(length=200),
}


def _nullable_columns(table):
    return {c['name'] for c in sa.inspect(op.get_bind()).get_columns(table) if c['nullable']}


def upgrade():
    bind = op.get_bind()
    nullable = _nullable_columns('user')
    for column, column_type in USER_REQUIRED.items():
        if column not in nullable:
            continue
        missing = bind.execute(sa.text(f'SELECT count(*) FROM "user" WHERE {column} IS NULL')).scalar()
        if missing:
            logger.warning('user.%s left nullable: %s legacy rows have no value', column, missing)
            continue
        op.alter_column('user', column, existing_type=column_type, nullable=False)


def downgrade():
    for column, column_type in USER_REQUIRED.items():
        op.alter_column('user', column, existing_type=column_type, nullable=True)
