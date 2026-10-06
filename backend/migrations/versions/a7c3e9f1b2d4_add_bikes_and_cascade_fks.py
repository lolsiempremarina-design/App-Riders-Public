"""Create the bike tables and align membership foreign keys with the models.

The ``Bike``/``BikeTracking`` models existed without a migration, so deleting a
user failed on PostgreSQL ("relation bikes does not exist"). The association
tables also lacked the ``ON DELETE CASCADE`` declared in the models.

Revision ID: a7c3e9f1b2d4
Revises: f1a2b3c4d5e6
"""

import sqlalchemy as sa
from alembic import op


revision = 'a7c3e9f1b2d4'
down_revision = 'f1a2b3c4d5e6'
branch_labels = None
depends_on = None

CASCADE_FKS = (
    ('group_memberships', 'group_id', 'groups'),
    ('group_memberships', 'user_id', 'user'),
    ('roles_users', 'user_id', 'user'),
    ('roles_users', 'role_id', 'role'),
)


def _existing_tables():
    return set(sa.inspect(op.get_bind()).get_table_names())


def _replace_fk(table, column, referred, ondelete):
    inspector = sa.inspect(op.get_bind())
    for fk in inspector.get_foreign_keys(table):
        if fk['constrained_columns'] == [column] and fk['referred_table'] == referred and fk.get('name'):
            op.drop_constraint(fk['name'], table, type_='foreignkey')
    op.create_foreign_key(f'{table}_{column}_fkey', table, referred, [column], ['id'], ondelete=ondelete)


def upgrade():
    tables = _existing_tables()
    if 'bikes' not in tables:
        op.create_table(
            'bikes',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('bike_id', sa.String(length=32), nullable=False, unique=True),
            sa.Column('user_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='SET NULL'),
                      nullable=True, unique=True),
            sa.Column('total_km', sa.Float(), nullable=True, server_default='0'),
        )
    if 'bike_trackings' not in tables:
        op.create_table(
            'bike_trackings',
            sa.Column('id', sa.Integer(), primary_key=True),
            sa.Column('bike_id', sa.Integer(), sa.ForeignKey('bikes.id', ondelete='CASCADE'), nullable=False),
            sa.Column('date', sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column('total_km', sa.Float(), nullable=False, server_default='0'),
            sa.Column('gpx_path', sa.String(length=512), nullable=True),
        )
        op.create_index('ix_bike_trackings_bike_id', 'bike_trackings', ['bike_id'])

    for table, column, referred in CASCADE_FKS:
        _replace_fk(table, column, referred, 'CASCADE')


def downgrade():
    for table, column, referred in CASCADE_FKS:
        _replace_fk(table, column, referred, None)
    op.drop_index('ix_bike_trackings_bike_id', table_name='bike_trackings')
    op.drop_table('bike_trackings')
    op.drop_table('bikes')
