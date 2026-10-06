"""Push tokens of the Android app (Firebase Cloud Messaging), phase 7.

Revision ID: a2e6c8f0b1d3
Revises: f6c1a9d4e7b2
"""

import sqlalchemy as sa
from alembic import op


revision = 'a2e6c8f0b1d3'
down_revision = 'f6c1a9d4e7b2'
branch_labels = None
depends_on = None

NOW = sa.text("(now() at time zone 'utc')")


def upgrade():
    op.create_table(
        'device_tokens',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='CASCADE'), nullable=False),
        sa.Column('token', sa.String(512), nullable=False, unique=True),
        sa.Column('platform', sa.String(10), nullable=False, server_default='android'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=NOW),
        sa.Column('last_seen_at', sa.DateTime(), nullable=False, server_default=NOW),
    )
    op.create_index('ix_device_tokens_user_id', 'device_tokens', ['user_id'])


def downgrade():
    op.drop_index('ix_device_tokens_user_id', table_name='device_tokens')
    op.drop_table('device_tokens')
