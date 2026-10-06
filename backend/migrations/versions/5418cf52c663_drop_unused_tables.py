"""Drop tables and columns that no code ever used (cleanup of 28/09/2026).

- daily_aggregates, hourly_daily_aggregates, monthly_aggregates, yearly_aggregates, time_dim: an analytics design
  that was never implemented (statistics are computed from rider_shifts and activities);
- bike_trackings and bikes.total_km: bike kilometres come from the GPS routes (rider_shifts.bike_id).

All of them were always empty/unused. The downgrade recreates them exactly as they were (reflected from PostgreSQL).

Revision ID: 5418cf52c663
Revises: a2e6c8f0b1d3
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision = '5418cf52c663'
down_revision = 'a2e6c8f0b1d3'
branch_labels = None
depends_on = None

# table → its indexes (dropped together with the table)
UNUSED_TABLES = {
    'daily_aggregates': ['idx_daily_aggregates_date'],
    'hourly_daily_aggregates': ['idx_hourly_daily_aggregates_date', 'idx_hourly_daily_aggregates_hour'],
    'monthly_aggregates': ['idx_monthly_aggregates_month', 'idx_monthly_aggregates_year'],
    'yearly_aggregates': ['idx_yearly_aggregates_year'],
    'time_dim': ['idx_time_dim_date', 'idx_time_dim_year_month'],
    'bike_trackings': ['ix_bike_trackings_bike_id'],
}


def upgrade():
    for table, indexes in UNUSED_TABLES.items():
        with op.batch_alter_table(table) as batch_op:
            for index in indexes:
                batch_op.drop_index(index)
        op.drop_table(table)
    with op.batch_alter_table('bikes') as batch_op:
        batch_op.drop_column('total_km')


def downgrade():
    with op.batch_alter_table('bikes') as batch_op:
        batch_op.add_column(sa.Column('total_km', sa.DOUBLE_PRECISION(precision=53),
                                      server_default=sa.text("'0'::double precision"), nullable=True))

    op.create_table(
        'time_dim',
        sa.Column('date', sa.DATE(), nullable=False),
        sa.Column('year', sa.INTEGER(), nullable=False),
        sa.Column('month', sa.INTEGER(), nullable=False),
        sa.Column('day', sa.INTEGER(), nullable=False),
        sa.Column('hour', sa.INTEGER(), nullable=True),
        sa.Column('week_day', sa.INTEGER(), nullable=False),
        sa.PrimaryKeyConstraint('date', name='time_dim_pkey'),
    )
    op.create_index('idx_time_dim_year_month', 'time_dim', ['year', 'month'])
    op.create_index('idx_time_dim_date', 'time_dim', ['date'])

    op.create_table(
        'yearly_aggregates',
        sa.Column('year', sa.INTEGER(), autoincrement=True, nullable=False),
        sa.Column('monthly_avg_speed', sa.NUMERIC(precision=5, scale=2), nullable=False),
        sa.Column('total_distance_km', sa.NUMERIC(precision=10, scale=3), nullable=False),
        sa.Column('total_duration', sa.INTEGER(), nullable=False),
        sa.PrimaryKeyConstraint('year', name='yearly_aggregates_pkey'),
    )
    op.create_index('idx_yearly_aggregates_year', 'yearly_aggregates', ['year'])

    op.create_table(
        'monthly_aggregates',
        sa.Column('year', sa.INTEGER(), nullable=False),
        sa.Column('month', sa.INTEGER(), nullable=False),
        sa.Column('daily_avg_speed', sa.NUMERIC(precision=5, scale=2), nullable=False),
        sa.Column('total_distance_km', sa.NUMERIC(precision=10, scale=3), nullable=False),
        sa.Column('total_duration', sa.INTEGER(), nullable=False),
        sa.Column('active_hours', sa.NUMERIC(precision=5, scale=2), nullable=False),
        sa.PrimaryKeyConstraint('year', 'month', name='uix_monthly_year_month'),
    )
    op.create_index('idx_monthly_aggregates_year', 'monthly_aggregates', ['year'])
    op.create_index('idx_monthly_aggregates_month', 'monthly_aggregates', ['month'])

    op.create_table(
        'hourly_daily_aggregates',
        sa.Column('date', sa.DATE(), nullable=False),
        sa.Column('hour', sa.INTEGER(), nullable=False),
        sa.Column('hourly_avg_speed', sa.NUMERIC(precision=5, scale=2), nullable=False),
        sa.Column('hourly_distance_km', sa.NUMERIC(precision=10, scale=3), nullable=False),
        sa.Column('duration_sec', sa.INTEGER(), nullable=False),
        sa.PrimaryKeyConstraint('date', 'hour', name='uix_hourly_daily_date_hour'),
    )
    op.create_index('idx_hourly_daily_aggregates_hour', 'hourly_daily_aggregates', ['hour'])
    op.create_index('idx_hourly_daily_aggregates_date', 'hourly_daily_aggregates', ['date'])

    op.create_table(
        'bike_trackings',
        sa.Column('id', sa.INTEGER(), autoincrement=True, nullable=False),
        sa.Column('bike_id', sa.INTEGER(), nullable=False),
        sa.Column('date', postgresql.TIMESTAMP(), server_default=sa.text('now()'), nullable=False),
        sa.Column('total_km', sa.DOUBLE_PRECISION(precision=53), server_default=sa.text("'0'::double precision"),
                  nullable=False),
        sa.Column('gpx_path', sa.VARCHAR(length=512), nullable=True),
        sa.ForeignKeyConstraint(['bike_id'], ['bikes.id'], name='bike_trackings_bike_id_fkey', ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name='bike_trackings_pkey'),
    )
    op.create_index('ix_bike_trackings_bike_id', 'bike_trackings', ['bike_id'])

    op.create_table(
        'daily_aggregates',
        sa.Column('date', sa.DATE(), nullable=False),
        sa.Column('total_distance_km', sa.NUMERIC(precision=10, scale=3), nullable=False),
        sa.Column('duration_sec', sa.INTEGER(), nullable=False),
        sa.Column('avg_speed_kmh', sa.NUMERIC(precision=5, scale=2), nullable=False),
        sa.Column('active_hours', sa.NUMERIC(precision=5, scale=2), nullable=False),
        sa.PrimaryKeyConstraint('date', name='daily_aggregates_pkey'),
    )
    op.create_index('idx_daily_aggregates_date', 'daily_aggregates', ['date'])
