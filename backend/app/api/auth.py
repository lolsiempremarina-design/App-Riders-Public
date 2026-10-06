"""Session-based authentication endpoints for the React app.

The SPA is served from the same origin as Flask, so it reuses the Flask-Security
session cookie. Every state-changing request must send the CSRF token in the
``X-CSRFToken`` header (obtained from ``GET /api/auth/csrf`` or from the
``csrf_token`` field returned by login/register/session).
"""
import base64
import binascii
import re
from datetime import date

from flask import current_app, jsonify, request
from flask_security import current_user
from flask_security.utils import hash_password, login_user, logout_user, verify_and_update_password
from flask_wtf.csrf import generate_csrf
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError

from app.api import api_bp
from app.api.devices import forget_session_device
from app.api.messages import translate
from app.api.serializers import user_to_dict
from app.api.stats import local_today
from app.api.utils import (
    EMAIL_PATTERN,
    PHONE_PATTERN,
    ValidationError,
    api_error,
    clean_str,
    has_control_characters,
    json_body,
    login_required_json,
    password_error,
    text_value,
    unconfirmed_email_allowed,
)
from app.auth.account import delete_user_account
from app.auth.email_confirmation import confirmation_required, send_code
from app.auth.models import SOSContact, User, user_datastore
from app.auth.tax_id import validate_personal_tax_id
from extensions import db, redis_client

USERNAME_PATTERN = re.compile(r'^[A-Za-z0-9_.\-]{3,50}$')
AVATAR_PATTERN = re.compile(r'^data:image/(png|jpe?g|webp|gif);base64,([A-Za-z0-9+/=]+)$')
MAX_AVATAR_BYTES = 512 * 1024
LOGIN_MAX_FAILURES = 10
LOGIN_LOCK_SECONDS = 15 * 60
# RoR is for riders who work on the road: only adults can register (the app checks it too).
MIN_AGE_YEARS = 18
PHONE_MIN_DIGITS, PHONE_MAX_DIGITS = 8, 15  # 15: the maximum of an international number (E.164)


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------

def _session_payload(user=None):
    return {
        'authenticated': user is not None,
        'user': user_to_dict(user) if user is not None else None,
        'csrf_token': generate_csrf(),
    }


def _find_user_by_identity(identity):
    identity = clean_str(identity).lower()
    if not identity:
        return None
    return User.query.filter(
        (func.lower(User.email) == identity) | (func.lower(User.username) == identity)
    ).first()


def _login_throttle_key(identity):
    return f"login_failures:{request.remote_addr or 'unknown'}:{clean_str(identity).lower()}"


def _is_login_locked(identity):
    try:
        failures = redis_client.get(_login_throttle_key(identity))
        return failures is not None and int(failures) >= LOGIN_MAX_FAILURES
    except Exception:  # noqa: BLE001 - throttling must never block logins if Redis is down
        return False


def _register_login_failure(identity):
    try:
        key = _login_throttle_key(identity)
        pipe = redis_client.pipeline()
        pipe.incr(key)
        pipe.expire(key, LOGIN_LOCK_SECONDS)
        pipe.execute()
    except Exception:  # noqa: BLE001
        current_app.logger.debug('Login throttle unavailable')


def _clear_login_failures(identity):
    try:
        redis_client.delete(_login_throttle_key(identity))
    except Exception:  # noqa: BLE001
        current_app.logger.debug('Login throttle unavailable')


def validate_avatar(value, errors, field='avatar'):
    """Accept an optional small data:image/...;base64 URL; return it or None."""
    value = clean_str(value)
    if not value:
        return None
    match = AVATAR_PATTERN.match(value)
    if not match:
        errors[field] = 'The profile photo must be a PNG, JPEG, WEBP or GIF image.'
        return None
    try:
        size = len(base64.b64decode(match.group(2), validate=True))
    except (binascii.Error, ValueError):
        errors[field] = 'The profile photo is corrupted.'
        return None
    if size > MAX_AVATAR_BYTES:
        errors[field] = 'The profile photo is too large (max 512 KB).'
        return None
    return value


def validate_phone(value, errors, field, required=False):
    value = clean_str(value)
    if not value:
        if required:
            errors[field] = 'The phone number is required.'
        return None
    if len(value) > 20:
        errors[field] = 'The phone number cannot exceed 20 characters.'
    elif not PHONE_PATTERN.match(value) or not any(char.isdigit() for char in value):
        errors[field] = 'The phone number contains invalid characters.'
    elif not PHONE_MIN_DIGITS <= sum(char.isdigit() for char in value) <= PHONE_MAX_DIGITS:
        # same rule as the app (isValidPhoneNumber in src/utils/authUtils.js): before, the API took "1" as the phone
        # of an SOS contact and the registration form took anything
        errors[field] = 'The phone number must have between 8 and 15 digits.'
    return value


def validate_email(value, errors, field='email', required=True):
    if value is not None and not isinstance(value, str):
        # a list ["a@b.it"] became the text "['a@b.it']", accepted as an address
        errors[field] = 'Enter a valid email address.'
        return None
    value = clean_str(value).lower()
    if not value:
        if required:
            errors[field] = 'Email is required.'
        return None
    if len(value) > 120 or not EMAIL_PATTERN.match(value):
        errors[field] = 'Enter a valid email address.'
    return value


def age_on(date_of_birth, today):
    """Completed years on ``today`` (born on 29 February: one year older on 1 March in common years)."""
    return today.year - date_of_birth.year - ((today.month, today.day) < (date_of_birth.month, date_of_birth.day))


def _parse_registration(data):
    errors = {}

    username = clean_str(data.get('username'))
    if not USERNAME_PATTERN.match(username):
        errors['username'] = 'Username must be 3-50 characters: letters, numbers, dot, dash or underscore.'

    email = validate_email(data.get('email'), errors)

    password = data.get('password') or ''
    if password_error(password):
        errors['password'] = password_error(password)
    elif password != (data.get('password_confirm') or ''):
        errors['password_confirm'] = 'Passwords do not match.'

    first_name = clean_str(data.get('first_name'))
    last_name = clean_str(data.get('last_name'))
    if not first_name or len(first_name) > 99:
        errors['first_name'] = 'First name is required (max 99 characters).'
    elif has_control_characters(first_name):
        errors['first_name'] = 'The first name must be on one line.'
    if not last_name or len(last_name) > 99:
        errors['last_name'] = 'Last name is required (max 99 characters).'
    elif has_control_characters(last_name):
        errors['last_name'] = 'The last name must be on one line.'

    date_of_birth = None
    try:
        date_of_birth = date.fromisoformat(clean_str(data.get('date_of_birth')))
        if date_of_birth > local_today() or date_of_birth.year < 1900:
            raise ValueError
    except ValueError:
        errors['date_of_birth'] = 'Enter a valid date of birth (YYYY-MM-DD).'
        date_of_birth = None
    else:
        if age_on(date_of_birth, local_today()) < MIN_AGE_YEARS:
            errors['date_of_birth'] = f'You must be at least {MIN_AGE_YEARS} years old to register.'

    gender = clean_str(data.get('gender')).upper()
    if gender not in ('M', 'F'):
        errors['gender'] = 'Please select a gender.'

    birth_city_country = clean_str(data.get('birth_city_country'))
    if not 2 <= len(birth_city_country) <= 200:
        errors['birth_city_country'] = 'City or country of birth is required.'
    elif has_control_characters(birth_city_country):
        errors['birth_city_country'] = 'The place of birth must be on one line.'

    tax_id_code = clean_str(data.get('tax_id_code')).upper()
    if len(tax_id_code) != 16:
        errors['tax_id_code'] = 'The tax ID code must be 16 characters long.'
    elif date_of_birth and first_name and last_name and gender in ('M', 'F'):
        tax_error = validate_personal_tax_id(tax_id_code, first_name, last_name, date_of_birth, gender)
        if tax_error:
            errors['tax_id_code'] = tax_error

    phone_number = validate_phone(data.get('phone_number'), errors, 'phone_number')
    avatar = validate_avatar(data.get('avatar'), errors)

    # Any two-letter code supported by the React app; the HTML pages fall back to English.
    language = clean_str(data.get('language')).lower()
    if not re.fullmatch(r'[a-z]{2}', language):
        language = 'en'

    sos = data.get('sos_contact') if isinstance(data.get('sos_contact'), dict) else None
    sos_contact = None
    if sos and any(clean_str(sos.get(key)) for key in ('name', 'phone', 'email')):
        sos_errors = {}
        sos_name = clean_str(sos.get('name'))
        if not sos_name or len(sos_name) > 100:
            sos_errors['sos_contact.name'] = 'Emergency contact name is required (max 100 characters).'
        sos_phone = validate_phone(sos.get('phone'), sos_errors, 'sos_contact.phone', required=True)
        sos_email = validate_email(sos.get('email'), sos_errors, 'sos_contact.email', required=False)
        relationship = clean_str(sos.get('relationship'))[:50] or None
        errors.update(sos_errors)
        sos_contact = {'name': sos_name, 'phone': sos_phone, 'email': sos_email, 'relationship': relationship}

    # Uniqueness checks (case-insensitive) only when the basic format is valid.
    if 'username' not in errors and User.query.filter(func.lower(User.username) == username.lower()).first():
        errors['username'] = 'This username is already taken.'
    if 'email' not in errors and User.query.filter(func.lower(User.email) == email).first():
        errors['email'] = 'This email is already registered.'
    if 'tax_id_code' not in errors and User.query.filter_by(tax_id_code=tax_id_code).first():
        errors['tax_id_code'] = 'This tax ID code is already registered.'
    if phone_number and 'phone_number' not in errors and User.query.filter_by(phone_number=phone_number).first():
        errors['phone_number'] = 'This phone number is already registered.'

    if errors:
        raise ValidationError(errors)

    return {
        'user': {
            'username': username,
            'email': email,
            'password': password,
            'first_name': first_name,
            'last_name': last_name,
            'full_name': f'{first_name} {last_name}',
            'date_of_birth': date_of_birth,
            'gender': gender,
            'birth_city_country': birth_city_country,
            'tax_id_code': tax_id_code,
            'phone_number': phone_number,
            'avatar': avatar,
            'language': language,
        },
        'sos_contact': sos_contact,
    }


# --------------------------------------------------------------------------
# Endpoints
# --------------------------------------------------------------------------

@api_bp.get('/health')
def health():
    return jsonify({'status': 'ok'})


@api_bp.get('/auth/csrf')
def csrf_token():
    return jsonify({'csrf_token': generate_csrf()})


@api_bp.get('/auth/session')
def session_state():
    """Bootstrap endpoint: never fails, tells the SPA who is logged in."""
    user = current_user._get_current_object() if current_user.is_authenticated else None
    return jsonify(_session_payload(user))


@api_bp.get('/auth/me')
@login_required_json
@unconfirmed_email_allowed
def me():
    return jsonify(user_to_dict(current_user))


@api_bp.post('/auth/login')
def login():
    data = json_body()
    identity = clean_str(data.get('identity') or data.get('email') or data.get('username'))
    password = text_value(data.get('password'))
    if not identity or not password:
        return api_error(400, 'Email/username and password are required.')

    if _is_login_locked(identity):
        return api_error(429, 'Too many failed attempts. Try again in 15 minutes.')

    user = _find_user_by_identity(identity)
    if user is None or not verify_and_update_password(password, user):
        _register_login_failure(identity)
        return api_error(401, 'Invalid credentials.', code='invalid_credentials')
    if not user.is_active:
        return api_error(403, 'This account has been disabled.', code='account_disabled')

    _clear_login_failures(identity)
    login_user(user, remember=bool(data.get('remember', True)), authn_via=['password'])
    db.session.commit()
    return jsonify(_session_payload(user))


@api_bp.post('/auth/logout')
def logout():
    if current_user.is_authenticated:
        forget_session_device(current_user.id)
        logout_user()
    return jsonify(_session_payload(None))


@api_bp.post('/auth/register')
def register():
    if current_user.is_authenticated:
        return api_error(409, 'You are already logged in. Log out to create a new account.', code='already_authenticated')

    parsed = _parse_registration(json_body())
    fields = parsed['user']
    password = fields.pop('password')

    # with the email service on, the account works once the code sent to its address is typed in the app
    confirm = confirmation_required()
    try:
        user = user_datastore.create_user(password=hash_password(password), **fields)
        db.session.flush()
        if confirm:
            user.email_confirmed_at = None  # after the INSERT: the column default fills a None given before it
        if parsed['sos_contact']:
            db.session.add(SOSContact(user_id=user.id, priority=1, **parsed['sos_contact']))
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return api_error(409, 'Some of these details are already registered.', code='conflict')

    login_user(user, remember=bool(json_body().get('remember', True)), authn_via=['password'])
    db.session.commit()
    if confirm:
        send_code(user, user.email)  # if it does not leave, the app asks for a new one
    return jsonify(_session_payload(user)), 201


@api_bp.post('/auth/delete-account')
@login_required_json
@unconfirmed_email_allowed
def delete_account():
    """GDPR 'right to be forgotten': requires the current password."""
    password = text_value(json_body().get('password'))
    user = current_user._get_current_object()
    if not password or not verify_and_update_password(password, user):
        return api_error(403, 'The password is not correct.', code='invalid_password')
    try:
        delete_user_account(user)
    except Exception:  # noqa: BLE001 - logged and rolled back by the helper
        return api_error(500, 'Unable to delete the account. Please try again later.')
    return jsonify({'success': True, 'message': translate('Account deleted.'), **_session_payload(None)})
