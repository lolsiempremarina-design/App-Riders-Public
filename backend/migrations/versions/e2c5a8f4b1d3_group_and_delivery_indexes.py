"""Indexes for the members of a group and the deliveries of a period (02/10/2026).

- group_memberships.group_id: the primary key starts with user_id, so the members of a group (every group
  page, the map, the chat) were found by reading the whole table;
- orders (status, delivered_at): the deliveries of a period (statistics and CSV of the admin panel).

Revision ID: e2c5a8f4b1d3
Revises: d4b7e9a2c6f1
"""
from alembic import op


revision = 'e2c5a8f4b1d3'
down_revision = 'd4b7e9a2c6f1'
branch_labels = None
depends_on = None


def upgrade():
    op.create_index('ix_group_memberships_group_id', 'group_memberships', ['group_id'])
    op.create_index('ix_orders_status_delivered', 'orders', ['status', 'delivered_at'])


def downgrade():
    op.drop_index('ix_orders_status_delivered', table_name='orders')
    op.drop_index('ix_group_memberships_group_id', table_name='group_memberships')
