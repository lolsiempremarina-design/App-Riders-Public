"""SOS request id chosen by the app, for automatic retries without duplicates (05/10/2026).

The app now retries an SOS by itself until it gets through (before, a failed attempt waited for the
rider to press "Retry", impossible after a fall that left them unconscious). Every retry carries the
same request_id: if the first attempt reached the server and only the answer was lost, the server
returns that alert instead of creating a second one and alerting the contacts again. The unique index
allows any number of NULL values (SOS sent by older versions of the app).

Revision ID: f7d2b4e9a1c6
Revises: e2c5a8f4b1d3
"""
import sqlalchemy as sa
from alembic import op


revision = 'f7d2b4e9a1c6'
down_revision = 'e2c5a8f4b1d3'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('sos_alerts', sa.Column('request_id', sa.String(length=36), nullable=True))
    op.create_index('ux_sos_alerts_user_request', 'sos_alerts', ['user_id', 'request_id'], unique=True)


def downgrade():
    op.drop_index('ux_sos_alerts_user_request', table_name='sos_alerts')
    op.drop_column('sos_alerts', 'request_id')
