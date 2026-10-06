"""Email confirmation from the app (rules in app/auth/email_confirmation.py): state, code, new code, cancel."""
from flask import jsonify
from flask_security import current_user
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError

from app.api import api_bp
from app.api.auth import _session_payload, validate_email
from app.api.utils import (
    ValidationError,
    api_error,
    clean_str,
    json_body,
    login_required_json,
    unconfirmed_email_allowed,
)
from app.auth.email_confirmation import (
    check_code,
    confirmation_required,
    pending_code,
    resend_wait_sec,
    send_code,
    utcnow,
)
from app.auth.models import User
from extensions import db


def _state(user):
    row = pending_code(user)
    return {
        'confirmed': user.email_confirmed_at is not None,
        'email': row.email if row else user.email,  # where the code was sent
        'resend_in_sec': resend_wait_sec(user),
        'mail_configured': confirmation_required(),
    }


def _email_taken(email, user):
    return User.query.filter(func.lower(User.email) == email.lower(), User.id != user.id).first() is not None


@api_bp.get('/auth/confirm-email')
@login_required_json
@unconfirmed_email_allowed
def confirm_email_state():
    return jsonify(_state(current_user))


@api_bp.post('/auth/confirm-email')
@login_required_json
@unconfirmed_email_allowed
def confirm_email():
    """The code sent by email: confirms a new account, or moves the account to the new address."""
    user = current_user._get_current_object()
    code = clean_str(json_body().get('code')).replace(' ', '')
    if not (len(code) == 6 and code.isascii() and code.isdigit()):
        raise ValidationError({'code': 'Enter the 6-digit code.'})
    result = check_code(user, code)
    if result != 'ok':
        db.session.commit()  # a wrong code counts as an attempt
        if result == 'none':
            return api_error(409, 'There is no email to confirm.', code='nothing_to_confirm')
        raise ValidationError({'code': 'The code is not correct.' if result == 'wrong'
                               else 'The code has expired or was typed wrong too many times: ask for a new one.'})

    row = pending_code(user)
    if row.email.lower() != user.email.lower():
        if _email_taken(row.email, user):  # registered by somebody else meanwhile
            db.session.delete(row)
            db.session.commit()
            raise ValidationError({'email': 'This email is already registered.'})
        user.email = row.email
    if user.email_confirmed_at is None:
        user.email_confirmed_at = utcnow()
    db.session.delete(row)
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return api_error(409, 'Some of these details are already registered.', code='conflict')
    return jsonify(_session_payload(user))


@api_bp.post('/auth/confirm-email/resend')
@login_required_json
@unconfirmed_email_allowed
def resend_email_code():
    """A new code. With ``email``: a new account corrects a mistyped address, a confirmed one changes the
    address to confirm (its own current address cancels the change)."""
    user = current_user._get_current_object()
    if not confirmation_required():
        return api_error(503, 'The email service is not configured: the code cannot be sent.',
                         code='email_not_configured')
    data = json_body()
    row = pending_code(user)
    target = row.email if row else (None if user.email_confirmed_at else user.email)
    if 'email' in data:
        errors = {}
        target = validate_email(data.get('email'), errors)
        if errors:
            raise ValidationError(errors)
        if _email_taken(target, user):
            raise ValidationError({'email': 'This email is already registered.'})
    if target is None:
        return api_error(409, 'There is no email to confirm.', code='nothing_to_confirm')

    if user.email_confirmed_at is not None and target.lower() == user.email.lower():
        if row is not None:
            db.session.delete(row)
            db.session.commit()
        return jsonify(_state(user))
    wait = resend_wait_sec(user)
    if wait:
        return api_error(429, f'Wait {wait} seconds before asking for a new code.', code='code_wait',
                         retry_after=wait)
    if user.email_confirmed_at is None:
        user.email = target  # a new account nobody can use yet: its address is simply corrected
    if not send_code(user, target):
        return api_error(503, 'The code could not be sent: try again in a minute.', code='email_not_sent')
    return jsonify(_state(user))


@api_bp.delete('/auth/confirm-email')
@login_required_json
def cancel_email_change():
    """Keeps the current address (a new account cannot cancel: it confirms, corrects the address or is deleted)."""
    user = current_user._get_current_object()
    row = pending_code(user)
    if row is not None:
        db.session.delete(row)
        db.session.commit()
    return jsonify(_session_payload(user))
