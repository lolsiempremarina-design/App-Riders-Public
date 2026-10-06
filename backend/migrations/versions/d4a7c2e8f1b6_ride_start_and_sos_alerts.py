"""Real start time of GPS routes and SOS alerts.

- ``rider_shifts.started_at``: first GPS point of the session (UTC), written by the
  GPS worker. Older rows keep NULL and are dated from ``created_at`` - duration.
- ``sos_alerts``: SOS sent from the React app (manual button or confirmed fall).

Revision ID: d4a7c2e8f1b6
Revises: c9e6a1b3d5f7
"""

import sqlalchemy as sa
from alembic import op


revision = 'd4a7c2e8f1b6'
down_revision = 'c9e6a1b3d5f7'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('rider_shifts', sa.Column('started_at', sa.DateTime(), nullable=True))
    op.create_table(
        'sos_alerts',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='CASCADE'), nullable=False),
        sa.Column('source', sa.String(length=10), nullable=False, server_default='manual'),
        sa.Column('status', sa.String(length=10), nullable=False, server_default='active'),
        sa.Column('latitude', sa.Float(), nullable=True),
        sa.Column('longitude', sa.Float(), nullable=True),
        sa.Column('accuracy_m', sa.Float(), nullable=True),
        sa.Column('session_id', sa.String(length=255), nullable=True),
        sa.Column('emails_sent', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text("(now() at time zone 'utc')")),
        sa.Column('resolved_at', sa.DateTime(), nullable=True),
    )
    op.create_index('ix_sos_alerts_user_status', 'sos_alerts', ['user_id', 'status'])


def downgrade():
    op.drop_index('ix_sos_alerts_user_status', table_name='sos_alerts')
    op.drop_table('sos_alerts')
    op.drop_column('rider_shifts', 'started_at')
