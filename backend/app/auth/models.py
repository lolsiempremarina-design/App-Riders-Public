import re
import secrets
import string
import uuid
from datetime import datetime, timezone

from flask_security import RoleMixin, SQLAlchemyUserDatastore, UserMixin
from sqlalchemy.orm import validates

from extensions import db

roles_users = db.Table('roles_users',
    db.Column('user_id', db.Integer(), db.ForeignKey('user.id', ondelete='CASCADE')),
    db.Column('role_id', db.Integer(), db.ForeignKey('role.id', ondelete='CASCADE'))
)

class Role(db.Model, RoleMixin):
    id = db.Column(db.Integer(), primary_key=True)
    name = db.Column(db.String(80), unique=True)
    description = db.Column(db.String(255))

class User(db.Model, UserMixin):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(255), unique=True, nullable=False)
    email = db.Column(db.String(255), unique=True, nullable=False)
    language = db.Column(db.String(2), nullable=False, default='en')
    sensors_enabled = db.Column(db.Boolean(), nullable=False, default=False)
    share_location_with_groups = db.Column(db.Boolean(), nullable=False, default=False)
    phone_number = db.Column(db.String(20), unique=True, nullable=True)
    tax_id_code = db.Column(db.String(16), unique=True, nullable=False)
    full_name = db.Column(db.String(200), nullable=False)
    first_name = db.Column(db.String(99), nullable=True)
    last_name = db.Column(db.String(99), nullable=True)
    date_of_birth = db.Column(db.Date(), nullable=False)
    gender = db.Column(db.String(1), nullable=False)
    birth_city_country = db.Column(db.String(200), nullable=False)
    avatar = db.Column(db.Text, nullable=True)  # small data:image/...;base64 URL
    password = db.Column(db.String(255), nullable=False)
    active = db.Column(db.Boolean(), default=True)
    fs_uniquifier = db.Column(db.String(64), unique=True, nullable=False, default=lambda: uuid.uuid4().hex)
    created_at = db.Column(db.DateTime, nullable=True, default=lambda: datetime.now(timezone.utc))  # NULL: older rows
    # NULL only for an account registered while the email service is on, until it types the code sent to it
    # (app/auth/email_confirmation.py); accounts created in any other way are confirmed when created.
    email_confirmed_at = db.Column(db.DateTime, nullable=True, default=lambda: datetime.now(timezone.utc))
    roles = db.relationship('Role', secondary=roles_users, backref=db.backref('users', lazy='selectin'))
    group_memberships = db.relationship('GroupMembership', back_populates='user', cascade='all, delete-orphan')
    rider_shifts = db.relationship('RiderShift', back_populates='user', cascade='all, delete-orphan')
    fall_events = db.relationship('FallEvent', back_populates='user', cascade='all, delete-orphan')
    sos_contacts = db.relationship('SOSContact', back_populates='user', cascade='all, delete-orphan')
    sos_alerts = db.relationship('SOSAlert', back_populates='user', cascade='all, delete-orphan')
    notifications = db.relationship('Notification', cascade='all, delete-orphan')
    device_tokens = db.relationship('DeviceToken', cascade='all, delete-orphan')
    chat_messages = db.relationship('ChatMessage', back_populates='user', cascade='all, delete-orphan')
    bike = db.relationship('Bike', back_populates='user', uselist=False)
    email_code = db.relationship('EmailCode', cascade='all, delete-orphan', uselist=False)

    # Validation to ensure that empty phone numbers are stored as NULL in the database
    @validates("phone_number")
    def validate_phone_number(self, key, value):
        if value is not None and not str(value).strip():
            return None  # Store NULL instead of empty string
        return value

class GroupMembership(db.Model):
    __tablename__ = 'group_memberships'
    user_id = db.Column(db.Integer, db.ForeignKey('user.id', ondelete='CASCADE'), primary_key=True)
    # own index: the primary key starts with user_id, the members of a group were found by reading the whole table
    group_id = db.Column(db.Integer, db.ForeignKey('groups.id', ondelete='CASCADE'), primary_key=True, index=True)

    role = db.Column(db.String(20), default='member', nullable=False)
    joined_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    user = db.relationship('User', back_populates='group_memberships')
    group = db.relationship('Group', back_populates='members')

class Group(db.Model):
    __tablename__ = 'groups'
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    description = db.Column(db.String(255), nullable=True)
    code = db.Column(db.String(12), unique=True, nullable=False, index=True)
    security_token = db.Column(db.String(64), unique=True, nullable=True, index=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    members = db.relationship('GroupMembership', back_populates='group', cascade='all, delete-orphan')
    messages = db.relationship('ChatMessage', cascade='all, delete-orphan')

    @staticmethod
    def generate_group_code():
        """Generates a unique code for the group (e.g. 'abc-defg-hij')."""
        part1 = ''.join(secrets.choice(string.ascii_lowercase) for _ in range(3))
        part2 = ''.join(secrets.choice(string.ascii_lowercase) for _ in range(4))
        part3 = ''.join(secrets.choice(string.ascii_lowercase) for _ in range(3))
        return f"{part1}-{part2}-{part3}"

    @staticmethod
    def normalize_code(raw_code: str) -> str:
        """
        Normalizes the code to the standard format 'xxx-yyyy-zzz'.
        Supports input with or without dashes and is case-insensitive.
        """
        if not raw_code:
            return ""
        cleaned = re.sub(r'[^a-zA-Z]', '', raw_code).lower()
        if len(cleaned) == 10:
            return f"{cleaned[:3]}-{cleaned[3:7]}-{cleaned[7:]}"
        return raw_code.strip().lower()

    def generate_security_token(self):
        """Generates a new random url-safe security token."""
        self.security_token = secrets.token_urlsafe(32)
        return self.security_token

    def revoke_security_token(self):
        """Revokes the current security token, invalidating old invite links."""
        self.security_token = None

class RiderShift(db.Model):
    __tablename__ = 'rider_shifts'
    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.String(255), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id', ondelete='CASCADE'), nullable=False)
    gpx_path = db.Column(db.String(512), nullable=False)
    total_distance_km = db.Column(db.Float, nullable=True)
    duration_min = db.Column(db.Float, nullable=True)  # moving time: pauses are excluded by the GPS worker
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    started_at = db.Column(db.DateTime, nullable=True)  # first GPS point (UTC); NULL for older rows
    # last GPS point (UTC): ended_at - started_at - duration_min = pauses; NULL for older rows without a GPX
    ended_at = db.Column(db.DateTime, nullable=True)
    # bike linked to the rider when the session was closed (set by the GPS worker)
    bike_id = db.Column(db.Integer, db.ForeignKey('bikes.id', ondelete='SET NULL'), nullable=True, index=True)

    user = db.relationship('User', back_populates='rider_shifts')
    bike = db.relationship('Bike', back_populates='shifts')

    __table_args__ = (
        db.UniqueConstraint('user_id', 'session_id', name='uq_rider_shifts_user_session'),
    )

class FallEvent(db.Model):
    __tablename__ = 'fall_events'
    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.String(255), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id', ondelete='CASCADE'), nullable=False)
    latitude = db.Column(db.Float, nullable=False)
    longitude = db.Column(db.Float, nullable=False)
    timestamp = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    
    user = db.relationship('User', back_populates='fall_events')

    __table_args__ = (
        db.UniqueConstraint(
            'user_id', 'session_id', 'timestamp', name='uq_fall_events_user_session_timestamp'
        ),
    )


class SOSContact(db.Model):
    """Emergency contacts for SOS notifications."""
    __tablename__ = 'sos_contacts'
    __table_args__ = (db.Index('ix_sos_contacts_user_priority', 'user_id', 'priority'),)
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id', ondelete='CASCADE'), nullable=False, index=True)
    name = db.Column(db.String(100), nullable=False)
    phone = db.Column(db.String(20), nullable=False)
    relationship = db.Column(db.String(50), nullable=True)  # e.g.: "Spouse", "Sibling", "Friend"
    email = db.Column(db.String(120), nullable=True)
    priority = db.Column(db.Integer, default=0, nullable=False)  # Priority order
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    
    user = db.relationship('User', back_populates='sos_contacts')

    @validates('name')
    def validate_name(self, key, value):
        if value:
            return value.strip()
        return value

    @validates('phone')
    def validate_phone(self, key, value):
        if value:
            return re.sub(r'[^\d+\-\s\(\)]', '', value)  # Keep only digits and valid phone characters
        return value

class SOSAlert(db.Model):
    """An SOS sent by a rider (manual button or confirmed fall)."""
    __tablename__ = 'sos_alerts'
    __table_args__ = (
        db.Index('ix_sos_alerts_user_status', 'user_id', 'status'),
        db.Index('ux_sos_alerts_user_request', 'user_id', 'request_id', unique=True),
    )

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id', ondelete='CASCADE'), nullable=False)
    source = db.Column(db.String(10), nullable=False, default='manual')  # 'manual' | 'fall'
    status = db.Column(db.String(10), nullable=False, default='active')  # 'active' | 'resolved'
    latitude = db.Column(db.Float, nullable=True)
    longitude = db.Column(db.Float, nullable=True)
    accuracy_m = db.Column(db.Float, nullable=True)
    session_id = db.Column(db.String(255), nullable=True)
    # Chosen by the app for each SOS and sent again with every automatic retry: a retry whose first
    # attempt did reach the server (only the answer was lost) gets that alert back instead of a second one.
    request_id = db.Column(db.String(36), nullable=True)
    emails_sent = db.Column(db.Integer, nullable=False, default=0)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    resolved_at = db.Column(db.DateTime, nullable=True)

    user = db.relationship('User', back_populates='sos_alerts')


class EmailCode(db.Model):
    """6-digit code sent to confirm an email address: the one of a new account or a new one from the profile."""
    __tablename__ = 'email_codes'

    user_id = db.Column(db.Integer, db.ForeignKey('user.id', ondelete='CASCADE'), primary_key=True)
    email = db.Column(db.String(255), nullable=False)  # the address the code was sent to
    code_hash = db.Column(db.String(64), nullable=False)  # HMAC of the code, never the code itself
    sent_at = db.Column(db.DateTime, nullable=False)
    expires_at = db.Column(db.DateTime, nullable=False)
    attempts = db.Column(db.Integer, nullable=False, default=0)


# We initialize the user_datastore here, but we will pass it to security.init_app in the factory
user_datastore = SQLAlchemyUserDatastore(db, User, Role)

def generate_bike_id():
    return ''.join(secrets.choice(string.ascii_letters) for _ in range(12))

class Bike(db.Model):
    """A physical bike with a public code (printed as QR). Riding it is recorded through
    the GPS routes (``RiderShift.bike_id``) of whoever has it linked."""
    __tablename__ = 'bikes'
    id = db.Column(db.Integer, primary_key=True)
    bike_id = db.Column(db.String(32), unique=True, nullable=False, default=generate_bike_id)  # public code
    user_id = db.Column(db.Integer, db.ForeignKey('user.id', ondelete='SET NULL'), nullable=True, unique=True)
    label = db.Column(db.String(120), nullable=True)
    model = db.Column(db.String(120), nullable=True)
    location = db.Column(db.String(200), nullable=True)
    description = db.Column(db.String(300), nullable=True)
    history = db.Column(db.Text, nullable=True)  # one event per line
    contact_phone = db.Column(db.String(20), nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), nullable=True)

    user = db.relationship('User', back_populates='bike')
    shifts = db.relationship('RiderShift', back_populates='bike', passive_deletes=True)
