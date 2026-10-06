"""Delivery orders.

Lifecycle: ``available`` (created by an admin) → ``accepted`` (a rider takes it) →
``picked_up`` → ``delivered``. A rider can hand an accepted order back
(``available`` again) before pickup; an admin can cancel any order not yet delivered.
Earnings are the ``pay + bonus`` of delivered orders.
"""
from datetime import datetime, timezone

from extensions import db

ORDER_STATUSES = ('available', 'accepted', 'picked_up', 'delivered', 'cancelled')
ACTIVE_STATUSES = ('accepted', 'picked_up')


def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Order(db.Model):
    __tablename__ = 'orders'
    __table_args__ = (
        db.Index('ix_orders_status_created', 'status', 'created_at'),
        db.Index('ix_orders_rider_status', 'rider_id', 'status'),
        db.Index('ix_orders_status_delivered', 'status', 'delivered_at'),  # deliveries of a period (admin panel)
    )

    id = db.Column(db.Integer, primary_key=True)
    restaurant_name = db.Column(db.String(150), nullable=False)
    pickup_address = db.Column(db.String(255), nullable=False)
    delivery_address = db.Column(db.String(255), nullable=False)
    customer_name = db.Column(db.String(100), nullable=True)
    items = db.Column(db.String(500), nullable=True)
    notes = db.Column(db.String(500), nullable=True)
    distance_km = db.Column(db.Float, nullable=True)
    pay = db.Column(db.Numeric(10, 2), nullable=False)
    bonus = db.Column(db.Numeric(10, 2), nullable=False, default=0)
    status = db.Column(db.String(20), nullable=False, default='available', index=True)
    rider_id = db.Column(db.Integer, db.ForeignKey('user.id', ondelete='SET NULL'), nullable=True)
    created_by_id = db.Column(db.Integer, db.ForeignKey('user.id', ondelete='SET NULL'), nullable=True)
    expires_at = db.Column(db.DateTime, nullable=True)   # no longer offered after this moment
    due_at = db.Column(db.DateTime, nullable=True)       # promised delivery time (punctuality)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)
    accepted_at = db.Column(db.DateTime, nullable=True)
    picked_up_at = db.Column(db.DateTime, nullable=True)
    delivered_at = db.Column(db.DateTime, nullable=True)
    cancelled_at = db.Column(db.DateTime, nullable=True)
    updated_at = db.Column(db.DateTime, nullable=False, default=utcnow, onupdate=utcnow)

    rider = db.relationship('User', foreign_keys=[rider_id])
    created_by = db.relationship('User', foreign_keys=[created_by_id])

    @property
    def total(self):
        return float(self.pay or 0) + float(self.bonus or 0)
