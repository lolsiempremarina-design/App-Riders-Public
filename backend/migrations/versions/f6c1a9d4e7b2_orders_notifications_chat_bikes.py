"""Orders, notifications, group chat and bike details (phase 5).

- ``orders``: an ``orders`` table created outside the migrations (no model, three demo
  rows with invented restaurants) is replaced by the real delivery orders table.
- ``notifications`` and ``chat_messages``.
- ``bikes``: descriptive fields; ``rider_shifts.bike_id`` links a GPS route to the bike
  the rider had linked. The five community bikes of the React catalogue are seeded
  (descriptions only: their statistics now come from real routes).

Revision ID: f6c1a9d4e7b2
Revises: e5b8d3f9a2c4
"""

import sqlalchemy as sa
from alembic import op


revision = 'f6c1a9d4e7b2'
down_revision = 'e5b8d3f9a2c4'
branch_labels = None
depends_on = None

NOW = sa.text("(now() at time zone 'utc')")

BIKES = [
    ('013-001', 'Tazzoli Community Bike #013-001', 'Decathlon Rockrider V0', 'RoR-XXX // HUMAN-AUGMENTED BIKE',
     '2026: Rinata nel laboratorio Tazzoli 13\n2019: Decathlon Original Purchase'),
    ('013-002', 'Tazzoli Community Bike #013-002', 'Decathlon Rockrider V1', 'It flies on liquid traffic.',
     '2025: Riparata nel cortile NoBa\n2018: Decathlon Original Purchase'),
    ('013-003', 'Tazzoli Community Bike #013-003', 'Decathlon Rockrider V2', 'Memory on two wheels.',
     '2024: Reborn in the courtyard\n2017: Decathlon Original Purchase'),
    ('013-004', 'Tazzoli Community Bike #013-004', 'Decathlon Rockrider V3', 'Tap to steal it legally.',
     '2026: Restored after a rainy winter\n2019: Decathlon Original Purchase'),
    ('013-005', 'Tazzoli Community Bike #013-005', 'Decathlon Rockrider V4', 'Your legs, your memory, your shortcut.',
     '2026: The fastest courtyard runner\n2020: Decathlon Original Purchase'),
]
BIKE_LOCATION = 'Via Tazzoli 13, Milano • NoBa Network'


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if 'orders' in inspector.get_table_names():
        op.drop_table('orders')  # legacy demo table without migration (see docstring)
    op.create_table(
        'orders',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('restaurant_name', sa.String(150), nullable=False),
        sa.Column('pickup_address', sa.String(255), nullable=False),
        sa.Column('delivery_address', sa.String(255), nullable=False),
        sa.Column('customer_name', sa.String(100), nullable=True),
        sa.Column('items', sa.String(500), nullable=True),
        sa.Column('notes', sa.String(500), nullable=True),
        sa.Column('distance_km', sa.Float(), nullable=True),
        sa.Column('pay', sa.Numeric(10, 2), nullable=False),
        sa.Column('bonus', sa.Numeric(10, 2), nullable=False, server_default='0'),
        sa.Column('status', sa.String(20), nullable=False, server_default='available'),
        sa.Column('rider_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_by_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='SET NULL'), nullable=True),
        sa.Column('expires_at', sa.DateTime(), nullable=True),
        sa.Column('due_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=NOW),
        sa.Column('accepted_at', sa.DateTime(), nullable=True),
        sa.Column('picked_up_at', sa.DateTime(), nullable=True),
        sa.Column('delivered_at', sa.DateTime(), nullable=True),
        sa.Column('cancelled_at', sa.DateTime(), nullable=True),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=NOW),
    )
    op.create_index('ix_orders_status', 'orders', ['status'])
    op.create_index('ix_orders_status_created', 'orders', ['status', 'created_at'])
    op.create_index('ix_orders_rider_status', 'orders', ['rider_id', 'status'])

    op.create_table(
        'notifications',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='CASCADE'), nullable=False),
        sa.Column('category', sa.String(20), nullable=False, server_default='sistema'),
        sa.Column('title', sa.String(150), nullable=False),
        sa.Column('body', sa.String(1000), nullable=True),
        sa.Column('link', sa.String(255), nullable=True),
        sa.Column('is_read', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=NOW),
    )
    op.create_index('ix_notifications_user_read', 'notifications', ['user_id', 'is_read'])

    op.create_table(
        'chat_messages',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('group_id', sa.Integer(), sa.ForeignKey('groups.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('user.id', ondelete='CASCADE'), nullable=False),
        sa.Column('kind', sa.String(10), nullable=False, server_default='text'),
        sa.Column('text', sa.String(1000), nullable=True),
        sa.Column('latitude', sa.Float(), nullable=True),
        sa.Column('longitude', sa.Float(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=NOW),
    )
    op.create_index('ix_chat_messages_group_id_id', 'chat_messages', ['group_id', 'id'])

    with op.batch_alter_table('bikes') as batch:
        batch.add_column(sa.Column('label', sa.String(120), nullable=True))
        batch.add_column(sa.Column('model', sa.String(120), nullable=True))
        batch.add_column(sa.Column('location', sa.String(200), nullable=True))
        batch.add_column(sa.Column('description', sa.String(300), nullable=True))
        batch.add_column(sa.Column('history', sa.Text(), nullable=True))
        batch.add_column(sa.Column('contact_phone', sa.String(20), nullable=True))
        batch.add_column(sa.Column('created_at', sa.DateTime(), nullable=True, server_default=NOW))
    op.add_column('rider_shifts', sa.Column('bike_id', sa.Integer(), nullable=True))
    op.create_foreign_key('rider_shifts_bike_id_fkey', 'rider_shifts', 'bikes', ['bike_id'], ['id'], ondelete='SET NULL')
    op.create_index('ix_rider_shifts_bike_id', 'rider_shifts', ['bike_id'])

    bikes = sa.table('bikes', sa.column('bike_id', sa.String), sa.column('label', sa.String),
                     sa.column('model', sa.String), sa.column('location', sa.String),
                     sa.column('description', sa.String), sa.column('history', sa.Text),
                     sa.column('total_km', sa.Float))
    existing = {row[0] for row in bind.execute(sa.text('SELECT bike_id FROM bikes'))}
    op.bulk_insert(bikes, [
        {'bike_id': code, 'label': label, 'model': model, 'location': BIKE_LOCATION,
         'description': description, 'history': history, 'total_km': 0}
        for code, label, model, description, history in BIKES if code not in existing
    ])


def downgrade():
    op.drop_index('ix_rider_shifts_bike_id', table_name='rider_shifts')
    op.drop_constraint('rider_shifts_bike_id_fkey', 'rider_shifts', type_='foreignkey')
    op.drop_column('rider_shifts', 'bike_id')
    with op.batch_alter_table('bikes') as batch:
        for column in ('created_at', 'contact_phone', 'history', 'description', 'location', 'model', 'label'):
            batch.drop_column(column)
    op.drop_index('ix_chat_messages_group_id_id', table_name='chat_messages')
    op.drop_table('chat_messages')
    op.drop_index('ix_notifications_user_read', table_name='notifications')
    op.drop_table('notifications')
    op.drop_index('ix_orders_rider_status', table_name='orders')
    op.drop_index('ix_orders_status_created', table_name='orders')
    op.drop_index('ix_orders_status', table_name='orders')
    op.drop_table('orders')
