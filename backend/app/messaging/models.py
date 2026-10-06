"""Notifications shown in the app and group chat messages."""
from datetime import datetime, timezone

from extensions import db

NOTIFICATION_CATEGORIES = ('consegne', 'sicurezza', 'gruppi', 'sistema')


def utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


class Notification(db.Model):
    __tablename__ = 'notifications'
    __table_args__ = (db.Index('ix_notifications_user_read', 'user_id', 'is_read'),)

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id', ondelete='CASCADE'), nullable=False)
    category = db.Column(db.String(20), nullable=False, default='sistema')
    title = db.Column(db.String(150), nullable=False)
    body = db.Column(db.String(1000), nullable=True)
    link = db.Column(db.String(255), nullable=True)  # route of the React app, e.g. /consegne
    is_read = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)


class DeviceToken(db.Model):
    """Firebase Cloud Messaging token of an installed Android app (one row per app install)."""
    __tablename__ = 'device_tokens'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id', ondelete='CASCADE'), nullable=False, index=True)
    token = db.Column(db.String(512), nullable=False, unique=True)
    platform = db.Column(db.String(10), nullable=False, default='android')
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)
    last_seen_at = db.Column(db.DateTime, nullable=False, default=utcnow)


class ChatMessage(db.Model):
    __tablename__ = 'chat_messages'
    __table_args__ = (db.Index('ix_chat_messages_group_id_id', 'group_id', 'id'),)

    id = db.Column(db.Integer, primary_key=True)
    group_id = db.Column(db.Integer, db.ForeignKey('groups.id', ondelete='CASCADE'), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id', ondelete='CASCADE'), nullable=False)
    kind = db.Column(db.String(10), nullable=False, default='text')
    text = db.Column(db.String(1000), nullable=True)
    latitude = db.Column(db.Float, nullable=True)
    longitude = db.Column(db.Float, nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=utcnow)

    user = db.relationship('User', back_populates='chat_messages')
