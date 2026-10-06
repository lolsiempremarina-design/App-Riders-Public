"""Push notifications to the Android app through Firebase Cloud Messaging (HTTP v1 API).

Optional like SMTP: without the service account key (FCM_SERVICE_ACCOUNT_FILE, see secrets/README.md)
nothing is sent and the notifications stay in the app (Notifiche, banners while the app is open).

``notify()`` queues the pushes on the database session; they leave only after the commit, from a
background thread, so a slow or unreachable FCM never delays or breaks the request (orders, SOS...)
and a rolled-back notification is never pushed. Tokens that FCM rejects as unknown are deleted.
"""
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from flask import current_app
from sqlalchemy import event
from sqlalchemy.orm import Session

from extensions import db

FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging'
FCM_URL = 'https://fcm.googleapis.com/v1/projects/{project}/messages:send'
TIMEOUT_SEC = 10
PENDING_KEY = 'ror_pending_push'
# Android notification channels created by the app (one per notification category)
URGENT_CATEGORIES = ('sicurezza', 'consegne')
# FCM error codes meaning the token will never work again (app uninstalled, other project...)
INVALID_TOKEN_ERRORS = ('UNREGISTERED', 'SENDER_ID_MISMATCH')

# One worker: pushes leave in order and the cached credentials are never refreshed concurrently.
_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix='push')
_lock = threading.Lock()
_clients = {}  # key file -> (AuthorizedSession, project_id)


def push_configured(app=None):
    path = (app or current_app).config.get('FCM_SERVICE_ACCOUNT_FILE')
    return bool(path) and Path(path).is_file()


def queue_push(user_ids, category, title, body=None, link=None):
    """Push the notification to every registered device of ``user_ids`` after the next commit."""
    ids = [uid for uid in dict.fromkeys(user_ids) if uid is not None]
    if not ids or not push_configured():
        return
    db.session.info.setdefault(PENDING_KEY, []).append({
        'user_ids': ids, 'category': category, 'title': title, 'body': body or '', 'link': link or '/notifiche',
    })


@event.listens_for(Session, 'after_commit')
def _after_commit(session):
    pending = session.info.pop(PENDING_KEY, None)
    if pending:
        _dispatch(current_app._get_current_object(), pending)


@event.listens_for(Session, 'after_rollback')
def _after_rollback(session):
    session.info.pop(PENDING_KEY, None)


def _dispatch(app, pending):
    _executor.submit(deliver, app, pending)


def deliver(app, pending):
    """Send the queued pushes (own app context and database session). Returns {'sent', 'failed', 'removed'}."""
    result = {'sent': 0, 'failed': 0, 'removed': 0}
    from app.messaging.models import DeviceToken  # local import: models import this module indirectly

    with app.app_context():
        try:
            for item in pending:
                devices = DeviceToken.query.filter(DeviceToken.user_id.in_(item['user_ids'])).all()
                for device in devices:
                    outcome = send_message(app, device.token, item)
                    if outcome == 'invalid':
                        db.session.delete(device)
                        result['removed'] += 1
                    else:
                        result['sent' if outcome == 'sent' else 'failed'] += 1
            db.session.commit()
        except Exception:  # noqa: BLE001 - a push must never break anything else
            db.session.rollback()
            app.logger.exception('Push delivery failed')
        finally:
            db.session.remove()
    return result


def build_message(token, item):
    category = item['category']
    return {'message': {
        'token': token,
        'notification': {'title': item['title'][:150], 'body': (item['body'] or '')[:1000]},
        # read by the app when the notification is tapped: it opens this page
        'data': {'link': item['link'], 'category': category},
        'android': {
            'priority': 'high' if category in URGENT_CATEGORIES else 'normal',
            'notification': {'channel_id': category},
        },
    }}


def _client(app):
    path = app.config['FCM_SERVICE_ACCOUNT_FILE']
    with _lock:
        if path not in _clients:
            from google.auth.transport.requests import AuthorizedSession
            from google.oauth2 import service_account

            credentials = service_account.Credentials.from_service_account_file(path, scopes=[FCM_SCOPE])
            _clients[path] = (AuthorizedSession(credentials), credentials.project_id)
        return _clients[path]


def _error(response):
    """(FCM error code, message) of a refused request."""
    try:
        error = response.json().get('error', {})
    except ValueError:
        return None, ''
    codes = [d['errorCode'] for d in error.get('details') or [] if d.get('errorCode')]
    return (codes[0] if codes else error.get('status')), str(error.get('message') or '')


def send_message(app, token, item):
    """'sent', 'invalid' (the token must be deleted) or 'error' (FCM or network problem)."""
    try:
        session, project = _client(app)
        response = session.post(FCM_URL.format(project=project), json=build_message(token, item), timeout=TIMEOUT_SEC)
    except Exception:  # noqa: BLE001 - bad key file, DNS, timeout...
        app.logger.exception('Unable to reach Firebase Cloud Messaging')
        return 'error'
    if response.status_code == 200:
        return 'sent'
    code, message = _error(response)
    if response.status_code == 404 or code in INVALID_TOKEN_ERRORS or (
        code == 'INVALID_ARGUMENT' and 'registration token' in message.lower()
    ):
        return 'invalid'
    app.logger.warning('FCM refused a push (HTTP %s, %s)', response.status_code, code)
    return 'error'
