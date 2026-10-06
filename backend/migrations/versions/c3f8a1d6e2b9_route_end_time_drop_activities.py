"""Last GPS point of every route (rider_shifts.ended_at) and removal of the activities table (29/09/2026).

- ended_at: with started_at (first point) and duration_min (moving time) it gives the real pauses of a
  route, shown by the "Tempo totale" page. Older routes get it from the last point of their GPX file,
  when the file is still there (the GPS worker keeps the first and last point when it simplifies it);
- activities: filled only by the old /telemetry/activity page, removed on 28/09. The statistics now
  come from the GPS routes alone. The downgrade recreates the table empty, as it was in PostgreSQL.

Revision ID: c3f8a1d6e2b9
Revises: 5418cf52c663
"""
import xml.etree.ElementTree as ET
from datetime import datetime, timezone

import sqlalchemy as sa
from alembic import op


revision = 'c3f8a1d6e2b9'
down_revision = '5418cf52c663'
branch_labels = None
depends_on = None


def _last_point_time(path):
    """Time of the last track point of a GPX file (naive UTC), None if the file is missing or unreadable."""
    try:
        last = None
        for _event, element in ET.iterparse(path):
            if element.tag.rsplit('}', 1)[-1] != 'trkpt':
                continue
            text = next((child.text for child in element if child.tag.rsplit('}', 1)[-1] == 'time'), None)
            if text:
                last = text
            element.clear()
        if last is None:
            return None
        value = datetime.fromisoformat(last.strip().replace('Z', '+00:00'))
        if value.tzinfo is not None:
            value = value.astimezone(timezone.utc).replace(tzinfo=None)
        return value
    except (OSError, ET.ParseError, ValueError):
        return None


def upgrade():
    with op.batch_alter_table('rider_shifts') as batch_op:
        batch_op.add_column(sa.Column('ended_at', sa.DateTime(), nullable=True))

    bind = op.get_bind()
    rows = bind.execute(sa.text(
        "SELECT id, gpx_path FROM rider_shifts WHERE ended_at IS NULL AND gpx_path <> ''"
    )).fetchall()
    for row_id, gpx_path in rows:
        ended = _last_point_time(gpx_path)
        if ended is not None:
            bind.execute(sa.text('UPDATE rider_shifts SET ended_at = :ended WHERE id = :id'),
                         {'ended': ended, 'id': row_id})

    with op.batch_alter_table('activities') as batch_op:
        batch_op.drop_index('idx_activities_user_id')
        batch_op.drop_index('idx_activities_start_datetime')
    op.drop_table('activities')


def downgrade():
    op.create_table(
        'activities',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('start_datetime', sa.DateTime(), nullable=False),
        sa.Column('duration_sec', sa.Integer(), nullable=False),
        sa.Column('distance_km', sa.Numeric(precision=10, scale=3), nullable=False),
        sa.Column('avg_speed_kmh', sa.Numeric(precision=5, scale=2), nullable=False),
        sa.Column('active_time_sec', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['user.id'], name='activities_user_id_fkey', ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name='activities_pkey'),
    )
    op.create_index('idx_activities_start_datetime', 'activities', ['start_datetime'])
    op.create_index('idx_activities_user_id', 'activities', ['user_id'])

    with op.batch_alter_table('rider_shifts') as batch_op:
        batch_op.drop_column('ended_at')
