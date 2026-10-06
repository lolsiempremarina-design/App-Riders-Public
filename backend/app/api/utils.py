"""Shared helpers for the JSON API: errors, auth guard and input parsing."""
import re
import unicodedata
from functools import wraps

from flask import jsonify, request
from flask_security import current_user
from flask_wtf.csrf import CSRFError
from werkzeug.exceptions import HTTPException
from werkzeug.routing import IntegerConverter

from app.api.messages import translate

PHONE_PATTERN = re.compile(r'^[\d\s+\-()]*$')
# the rule of the email fields of the forms (WHATWG, type="email") plus a dot in the domain: before, commas,
# brackets and quotes were accepted, in addresses that then receive the SOS emails and the codes
EMAIL_PATTERN = re.compile(
    r"^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?"
    r"(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$"
)
MAX_DB_ID = 2**31 - 1  # PostgreSQL INTEGER: a bigger value makes the query fail (500)


class DatabaseIdConverter(IntegerConverter):
    """``<int:...>`` limited to the database integer range: a huge id in the URL is a 404."""

    def __init__(self, map, *args, **kwargs):
        kwargs.setdefault('max', MAX_DB_ID)
        super().__init__(map, *args, **kwargs)


def db_id_arg(name):
    """Query string id (e.g. ``after_id``) as an int, or None if missing, not a number or out of range."""
    value = request.args.get(name, '')
    return int(value) if value.isascii() and value.isdigit() and int(value) <= MAX_DB_ID else None


class ValidationError(Exception):
    """Raised with a {field: message} mapping when user input is invalid."""

    def __init__(self, fields, message='Some fields are not valid.'):
        super().__init__(message)
        self.fields = fields
        self.message = message


def api_error(status, message, code=None, **extra):
    """JSON error; message (written in English) goes out in the language of the app (app/api/messages.py)."""
    payload = {'error': code or _default_code(status), 'message': translate(message)}
    payload.update(extra)
    return jsonify(payload), status


def translate_fields(fields, language=None):
    """The {field: message} of a ValidationError in the language of the app."""
    return {name: translate_fields(value, language) if isinstance(value, dict) else translate(value, language)
            for name, value in (fields or {}).items()}


def _default_code(status):
    return {
        400: 'bad_request',
        401: 'unauthorized',
        403: 'forbidden',
        404: 'not_found',
        405: 'method_not_allowed',
        409: 'conflict',
        413: 'payload_too_large',
        422: 'validation_error',
        429: 'too_many_requests',
    }.get(status, 'server_error' if status >= 500 else 'error')


def login_required_json(view):
    """Like auth_required() but always answers with a JSON 401.

    An account that has not confirmed its email yet (app/auth/email_confirmation.py) gets a 403
    ``email_not_confirmed``, except on the views marked with @unconfirmed_email_allowed.
    """

    @wraps(view)
    def wrapper(*args, **kwargs):
        if not current_user.is_authenticated:
            return api_error(401, 'Authentication required.')
        if current_user.email_confirmed_at is None and not getattr(view, 'allow_unconfirmed_email', False):
            return api_error(403, 'Confirm your email address first: enter the code we sent you.',
                             code='email_not_confirmed')
        return view(*args, **kwargs)

    return wrapper


def unconfirmed_email_allowed(view):
    """Under @login_required_json: the view works also before the email is confirmed (the confirmation
    itself, the profile read by the app, language and push settings, account deletion)."""
    view.allow_unconfirmed_email = True
    return view


def json_body():
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


def clean_str(value):
    """Text from a request, trimmed. NUL characters are removed: PostgreSQL refuses them (it was a 500).
    A list or an object is not text: before, ["Mario"] was saved as the name "['Mario']"."""
    if value is None or isinstance(value, (list, dict)):
        return ''
    return str(value).replace('\x00', '').strip()


def has_control_characters(value):
    """True for line breaks, tabs and other control characters: not allowed in one-line fields such as
    names (a line break in the name broke the subject of the SOS emails)."""
    return any(unicodedata.category(char) == 'Cc' for char in value)


def text_value(value):
    """``value`` if it is a usable string, else '' (a password sent as a number, or with a NUL character
    that bcrypt refuses: a wrong password, not a 500)."""
    return value if isinstance(value, str) and '\x00' not in value else ''


PASSWORD_MIN_LENGTH = 8
PASSWORD_MAX_LENGTH = 128


def password_error(password):
    """Error message for a new password, or None."""
    if not isinstance(password, str) or len(password) < PASSWORD_MIN_LENGTH:
        return f'Password must be at least {PASSWORD_MIN_LENGTH} characters.'
    if len(password) > PASSWORD_MAX_LENGTH:
        return f'Password must be at most {PASSWORD_MAX_LENGTH} characters.'
    if '\x00' in password:
        return 'The password contains a character that is not allowed.'
    return None


def is_api_request():
    return request.path == '/api' or request.path.startswith('/api/')


def register_api_error_handlers(app):
    """Return JSON errors for /api/* while keeping HTML errors elsewhere."""

    @app.errorhandler(ValidationError)
    def _validation_error(error):
        return api_error(422, error.message, fields=translate_fields(error.fields))

    @app.errorhandler(HTTPException)
    def _http_error(error):
        if not is_api_request():
            return error
        if isinstance(error, CSRFError):
            return api_error(400, 'Security token missing or expired. Please retry.', code='csrf_error')
        message = error.description if error.code and error.code < 500 else 'Internal server error.'
        return api_error(error.code or 500, message)
