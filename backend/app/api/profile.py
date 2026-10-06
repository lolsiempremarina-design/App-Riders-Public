"""Profile, password, SOS contacts and settings endpoints for the React app."""
import re
import uuid

from flask import current_app, jsonify
from flask_security import current_user
from flask_security.utils import hash_password, login_user, verify_and_update_password
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError

from app.api import api_bp
from app.api.auth import (
    USERNAME_PATTERN,
    _session_payload,
    validate_avatar,
    validate_email,
    validate_phone,
)
from app.api.devices import forget_other_devices
from app.api.serializers import sos_contact_to_dict, user_to_dict
from app.api.utils import (
    ValidationError,
    api_error,
    clean_str,
    json_body,
    login_required_json,
    password_error,
    text_value,
    unconfirmed_email_allowed,
)
from app.auth.email_confirmation import confirmation_required, resend_wait_sec, send_code
from app.auth.models import RiderShift, SOSContact, User
from extensions import db, redis_client

MAX_SOS_CONTACTS = 5
LANGUAGE_PATTERN = re.compile(r'^[a-z]{2}$')


# --------------------------------------------------------------------------
# Profile
# --------------------------------------------------------------------------

def _profile_stats(user_id):
    shift_count, shift_km, shift_minutes = (
        db.session.query(
            func.count(RiderShift.id),
            func.coalesce(func.sum(RiderShift.total_distance_km), 0),
            func.coalesce(func.sum(RiderShift.duration_min), 0),
        )
        .filter(RiderShift.user_id == user_id)
        .one()
    )
    return {
        'rides_count': int(shift_count or 0),
        'total_distance_km': round(float(shift_km or 0), 2),
        'total_duration_min': round(float(shift_minutes or 0), 1),
    }


@api_bp.get('/profile')
@login_required_json
def get_profile():
    return jsonify({'user': user_to_dict(current_user), 'stats': _profile_stats(current_user.id)})


@api_bp.patch('/profile')
@login_required_json
def update_profile():
    """Update contact details and photo. Legal identity (name, tax ID) is read-only."""
    data = json_body()
    user = current_user._get_current_object()
    errors = {}
    updates = {}

    if 'username' in data:
        username = clean_str(data.get('username'))
        if not USERNAME_PATTERN.match(username):
            errors['username'] = 'Username must be 3-50 characters: letters, numbers, dot, dash or underscore.'
        elif User.query.filter(func.lower(User.username) == username.lower(), User.id != user.id).first():
            errors['username'] = 'This username is already taken.'
        else:
            updates['username'] = username

    new_email = None  # with the email service on, a new address is used only once its code is typed
    if 'email' in data:
        email = validate_email(data.get('email'), errors)
        if 'email' not in errors:
            if User.query.filter(func.lower(User.email) == email, User.id != user.id).first():
                errors['email'] = 'This email is already registered.'
            elif email != (user.email or '').lower() and confirmation_required():
                wait = resend_wait_sec(user)
                if wait:
                    errors['email'] = f'Wait {wait} seconds before asking for a new code.'
                else:
                    new_email = email
            else:
                updates['email'] = email

    if 'phone_number' in data:
        phone = validate_phone(data.get('phone_number'), errors, 'phone_number')
        if 'phone_number' not in errors:
            if phone and User.query.filter(User.phone_number == phone, User.id != user.id).first():
                errors['phone_number'] = 'This phone number is already registered.'
            else:
                updates['phone_number'] = phone

    if 'avatar' in data:
        avatar = validate_avatar(data.get('avatar'), errors)
        if 'avatar' not in errors:
            updates['avatar'] = avatar  # None removes the custom photo

    if errors:
        raise ValidationError(errors)

    for field, value in updates.items():
        setattr(user, field, value)
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return api_error(409, 'Some of these details are already registered.', code='conflict')

    result = {}
    if new_email:
        result['email_confirmation_sent'] = send_code(user, new_email)
    return jsonify({'user': user_to_dict(user), 'stats': _profile_stats(user.id), **result})


@api_bp.post('/profile/password')
@login_required_json
def change_password():
    data = json_body()
    user = current_user._get_current_object()
    current_password = text_value(data.get('current_password'))
    new_password = data.get('new_password') or ''
    errors = {}

    if not current_password or not verify_and_update_password(current_password, user):
        errors['current_password'] = 'The current password is not correct.'
    if password_error(new_password):
        errors['new_password'] = password_error(new_password)
    elif new_password != (data.get('new_password_confirm') or ''):
        errors['new_password_confirm'] = 'Passwords do not match.'
    elif new_password == current_password:
        errors['new_password'] = 'The new password must be different from the current one.'
    if errors:
        raise ValidationError(errors)

    user.password = hash_password(new_password)
    # Rotating the uniquifier logs out every other device and invalidates remember-me cookies;
    # their push tokens go too, otherwise a lost or stolen phone kept receiving the notifications.
    user.fs_uniquifier = uuid.uuid4().hex
    forget_other_devices(user.id)
    db.session.commit()
    login_user(user, remember=True, authn_via=['password'])
    db.session.commit()
    return jsonify({'success': True, **_session_payload(user)})


# --------------------------------------------------------------------------
# SOS contacts
# --------------------------------------------------------------------------

def _ordered_contacts(user_id):
    return (
        SOSContact.query.filter_by(user_id=user_id)
        .order_by(SOSContact.priority.desc(), SOSContact.created_at.asc(), SOSContact.id.asc())
        .all()
    )


def _parse_contact(data, partial=False):
    errors = {}
    values = {}
    if not partial or 'name' in data:
        name = clean_str(data.get('name'))
        if not 2 <= len(name) <= 100:
            errors['name'] = 'Name must be between 2 and 100 characters.'
        values['name'] = name
    if not partial or 'phone' in data:
        values['phone'] = validate_phone(data.get('phone'), errors, 'phone', required=True)
    if not partial or 'email' in data:
        values['email'] = validate_email(data.get('email'), errors, 'email', required=False)
    if not partial or 'relationship' in data:
        relationship = clean_str(data.get('relationship'))
        if len(relationship) > 50:
            errors['relationship'] = 'Relationship must be at most 50 characters.'
        values['relationship'] = relationship or None
    if not partial or 'priority' in data:
        try:
            priority = int(data.get('priority', 1))
        except (TypeError, ValueError):
            priority = -1
        if priority not in (0, 1, 2):
            errors['priority'] = 'Priority must be 0 (low), 1 (medium) or 2 (high).'
        values['priority'] = priority
    if errors:
        raise ValidationError(errors)
    return values


@api_bp.get('/sos-contacts')
@login_required_json
def list_sos_contacts():
    contacts = _ordered_contacts(current_user.id)
    return jsonify({'contacts': [sos_contact_to_dict(c) for c in contacts], 'max_contacts': MAX_SOS_CONTACTS})


@api_bp.post('/sos-contacts')
@login_required_json
def create_sos_contact():
    if SOSContact.query.filter_by(user_id=current_user.id).count() >= MAX_SOS_CONTACTS:
        return api_error(
            409,
            f'You can save at most {MAX_SOS_CONTACTS} SOS contacts. Remove one to add a new one.',
            code='limit_reached',
        )
    contact = SOSContact(user_id=current_user.id, **_parse_contact(json_body()))
    db.session.add(contact)
    db.session.commit()
    return jsonify(sos_contact_to_dict(contact)), 201


def _own_contact_or_404(contact_id):
    contact = SOSContact.query.filter_by(id=contact_id, user_id=current_user.id).first()
    if contact is None:
        return None, api_error(404, 'SOS contact not found.')
    return contact, None


@api_bp.patch('/sos-contacts/<int:contact_id>')
@login_required_json
def update_sos_contact(contact_id):
    contact, error = _own_contact_or_404(contact_id)
    if error:
        return error
    for field, value in _parse_contact(json_body(), partial=True).items():
        setattr(contact, field, value)
    db.session.commit()
    return jsonify(sos_contact_to_dict(contact))


@api_bp.delete('/sos-contacts/<int:contact_id>')
@login_required_json
def delete_sos_contact(contact_id):
    contact, error = _own_contact_or_404(contact_id)
    if error:
        return error
    db.session.delete(contact)
    db.session.commit()
    return jsonify({'success': True, 'id': contact_id})


# --------------------------------------------------------------------------
# Settings
# --------------------------------------------------------------------------

def _settings_dict(user):
    return {
        'language': user.language,
        'sensors_enabled': bool(user.sensors_enabled),
        'share_location_with_groups': bool(user.share_location_with_groups),
    }


@api_bp.get('/settings')
@login_required_json
@unconfirmed_email_allowed
def get_settings():
    return jsonify(_settings_dict(current_user))


@api_bp.patch('/settings')
@login_required_json
@unconfirmed_email_allowed
def update_settings():
    data = json_body()
    user = current_user._get_current_object()
    errors = {}

    if 'language' in data:
        language = clean_str(data.get('language')).lower()
        if not LANGUAGE_PATTERN.match(language):
            errors['language'] = 'Language must be a two-letter code.'
        else:
            user.language = language
    for field in ('sensors_enabled', 'share_location_with_groups'):
        if field in data:
            if not isinstance(data[field], bool):
                errors[field] = 'Must be true or false.'
            else:
                setattr(user, field, data[field])
    if errors:
        db.session.rollback()
        raise ValidationError(errors)

    db.session.commit()

    # Location sharing turned off: remove the live position immediately.
    if not user.sensors_enabled or not user.share_location_with_groups:
        try:
            redis_client.delete(f'group_position:{user.id}', f'position:{user.id}')
        except Exception:  # noqa: BLE001
            current_app.logger.exception('Unable to clear live position for user=%s', user.id)

    return jsonify(_settings_dict(user))
