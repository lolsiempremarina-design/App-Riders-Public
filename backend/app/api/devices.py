"""Push tokens of the Android app (phase 7).

The app registers its Firebase token after every login/start; the token is also kept in the
session so that logging out removes it even if the app cannot call DELETE (no push for a user
who logged out on that phone).
"""
import re

from flask import jsonify, session
from flask_security import current_user
from sqlalchemy.exc import IntegrityError

from app.api import api_bp
from app.api.utils import ValidationError, clean_str, json_body, login_required_json, unconfirmed_email_allowed
from app.messaging.models import DeviceToken, utcnow
from app.push import push_configured
from extensions import db

TOKEN_PATTERN = re.compile(r'^[A-Za-z0-9_:.\-]{20,512}$')
PLATFORMS = ('android',)
SESSION_KEY = 'push_token'


def _parse():
    data = json_body()
    token = clean_str(data.get('token'))
    platform = clean_str(data.get('platform')) or 'android'
    errors = {}
    if not TOKEN_PATTERN.match(token):
        errors['token'] = 'A valid push token is required.'
    if platform not in PLATFORMS:
        errors['platform'] = 'Platform must be "android".'
    if errors:
        raise ValidationError(errors)
    return token, platform


def _save(token, platform):
    device = DeviceToken.query.filter_by(token=token).first()
    now = utcnow()
    if device is None:
        device = DeviceToken(token=token, platform=platform, created_at=now)
        db.session.add(device)
    # same phone, another account (e.g. logout without network): the token follows who is logged in
    device.user_id = current_user.id
    device.platform = platform
    device.last_seen_at = now
    db.session.commit()


@api_bp.post('/devices')
@login_required_json
@unconfirmed_email_allowed
def register_device():
    token, platform = _parse()
    try:
        _save(token, platform)
    except IntegrityError:  # the same token registered by a concurrent request
        db.session.rollback()
        _save(token, platform)
    session[SESSION_KEY] = token
    return jsonify({'registered': True, 'push_enabled': push_configured()})


@api_bp.delete('/devices')
@login_required_json
@unconfirmed_email_allowed
def unregister_device():
    token, _platform = _parse()
    removed = DeviceToken.query.filter_by(token=token, user_id=current_user.id).delete(synchronize_session=False)
    db.session.commit()
    if session.get(SESSION_KEY) == token:
        session.pop(SESSION_KEY, None)
    return jsonify({'success': True, 'removed': removed})


def forget_other_devices(user_id):
    """Password changed: the other phones are logged out and must not receive this account's pushes any more
    (order addresses, SOS of the groups), e.g. after a theft. The phone in use keeps its token. Caller commits."""
    query = DeviceToken.query.filter(DeviceToken.user_id == user_id)
    keep = session.get(SESSION_KEY)
    if keep:
        query = query.filter(DeviceToken.token != keep)
    return query.delete(synchronize_session=False)


def forget_session_device(user_id):
    """At logout: this phone must not receive the pushes of the account that is leaving."""
    token = session.pop(SESSION_KEY, None)
    if token and user_id is not None:
        DeviceToken.query.filter_by(token=token, user_id=user_id).delete(synchronize_session=False)
        db.session.commit()
