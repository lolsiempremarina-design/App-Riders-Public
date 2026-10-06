"""WebSocket for the group chat: /ws/chat/<group_id>.

Nginx forwards /ws/* to the "ws" service: the same Flask app as "web", in its own Gunicorn with
many threads. Every open chat keeps one thread busy (gthread); in the same process as the API,
about 16 open chats were enough to leave the API requests (SOS included) waiting forever.
At most MAX_SOCKETS_PER_USER chats per account (error ``too_many_connections``, code 1008).

Authentication is the Flask-Security session cookie; the Origin must be this site.
Every connection subscribes to the group's Redis channel, so messages reach clients
connected to any Gunicorn worker.

Client → server (JSON): {"type": "message", "text"} · {"type": "location", "lat", "lon", "text"?}
                        · {"type": "typing"} · {"type": "ping"}
Server → client (JSON): {"type": "ready"} · {"type": "message", "message"} · {"type": "typing", "user_id", "username"}
                        · {"type": "pong"} · {"type": "error", "message", "code"?}

"ready" is the first event of every connection: it is sent once Redis has confirmed the subscription to the group's
channel, and from then on no message is lost. The browser sees the socket open a little earlier (before the
membership check and the subscription): a message sent in between was in neither the history loaded by the app nor
the socket, and the other member saw it only after reloading. The app loads the history again at "ready".

The React app sends its messages over HTTP (POST /api/groups/<id>/messages, app/api/chat.py), which answers with
the saved message or an error and broadcasts it here like the socket does: a socket that still looks open after a
network change is dead for up to 30 s, and a message written into it was lost without notice. The socket is used
for receiving, typing and ping; "message" and "location" still work for other clients.

A member who leaves or is removed stops receiving and sending at once: the change publishes a
``member_removed`` event that closes their sockets (code 1008, after an error with code
``not_a_member``); membership is also checked before every message and every 30 s, in case the
event was lost. The socket does not keep a database connection while it waits.
"""
import json
import time
import uuid
from types import SimpleNamespace
from urllib.parse import urlparse

from flask import current_app, request
from flask_security import current_user
from flask_sock import Sock

from app.api.messages import translate
from app.api.utils import ValidationError, translate_fields
from app.messaging.service import MEMBER_REMOVED, chat_channel, publish_chat_event
from app.messaging.texts import text_language
from extensions import db, redis_client

sock = Sock()

RECEIVE_TIMEOUT_SEC = 0.2
SUBSCRIBE_CONFIRM_TIMEOUT_SEC = 5.0
READY = {'type': 'ready'}
TYPING_MIN_INTERVAL_SEC = 2.0
MEMBERSHIP_CHECK_SEC = 30
CLOSE_POLICY_VIOLATION = 1008
NOT_A_MEMBER = {'type': 'error', 'code': 'not_a_member', 'message': 'You are no longer a member of this group.'}
# Every open chat keeps a server thread busy (the chat runs in its own "ws" service, see docker-compose.yml):
# one account cannot take them all. Each socket refreshes its entry at every membership check, so a
# connection that died without closing stops counting after SOCKET_STALE_SEC.
MAX_SOCKETS_PER_USER = 5
SOCKET_STALE_SEC = 3 * MEMBERSHIP_CHECK_SEC
TOO_MANY_SOCKETS = {'type': 'error', 'code': 'too_many_connections',
                    'message': f'At most {MAX_SOCKETS_PER_USER} chats can be open at the same time.'}


def _sockets_key(user_id):
    return f'ws_sockets:{user_id}'


def register_socket(client, user_id, socket_id, now=None):
    """Count this socket for the user. False if the user already has MAX_SOCKETS_PER_USER open ones.

    Redis unavailable: the chat works anyway (True).
    """
    now = time.time() if now is None else now
    key = _sockets_key(user_id)
    try:
        client.zremrangebyscore(key, '-inf', now - SOCKET_STALE_SEC)
        if client.zcard(key) >= MAX_SOCKETS_PER_USER:
            return False
        client.zadd(key, {socket_id: now})
        client.expire(key, SOCKET_STALE_SEC)
    except Exception:  # noqa: BLE001
        current_app.logger.exception('Unable to count the open chats of user=%s', user_id)
    return True


def refresh_socket(client, user_id, socket_id, now=None):
    try:
        client.zadd(_sockets_key(user_id), {socket_id: time.time() if now is None else now})
        client.expire(_sockets_key(user_id), SOCKET_STALE_SEC)
    except Exception:  # noqa: BLE001
        pass


def unregister_socket(client, user_id, socket_id):
    try:
        client.zrem(_sockets_key(user_id), socket_id)
    except Exception:  # noqa: BLE001
        pass


def forget_all_sockets(client):
    """At the start of the ws service (gunicorn_ws.conf.py) no chat is open yet. A restart kills the sockets
    without their cleanup: for SOCKET_STALE_SEC they still counted, and after an update an account that had
    3 chats open got the third one refused. Returns how many accounts had sockets counted."""
    keys = list(client.scan_iter(_sockets_key('*')))
    if keys:
        client.delete(*keys)
    return len(keys)


def origin_allowed(origin, host):
    """Same-site check against cross-site WebSocket hijacking."""
    if not origin:
        return True  # non-browser clients do not send Origin; the session cookie is still required
    return urlparse(origin).netloc.lower() == (host or '').lower()


def handle_client_event(user, group_id, raw):
    """Process one message from the client; returns an event to send back to it (or None).

    ``NOT_A_MEMBER`` means the user has left the group: the caller closes the socket.
    """
    from app.api.chat import create_message, is_member

    try:
        data = json.loads(raw)
    except (TypeError, ValueError):
        return {'type': 'error', 'message': 'Invalid JSON.'}
    if not isinstance(data, dict):
        return {'type': 'error', 'message': 'Invalid message.'}
    kind = data.get('type')
    if kind == 'ping':
        return {'type': 'pong'}
    if kind in ('typing', 'message', 'location') and not is_member(user.id, group_id):
        return NOT_A_MEMBER
    if kind == 'typing':
        publish_chat_event(group_id, {'type': 'typing', 'user_id': user.id, 'username': user.username})
        return None
    if kind in ('message', 'location'):
        try:
            create_message(user.id, group_id, {**data, 'kind': 'location' if kind == 'location' else 'text'})
        except ValidationError as error:
            # in the language of the profile: the browser does not send the app's language on a WebSocket
            language = text_language(user.language) if getattr(user, 'language', None) else 'en'
            return {'type': 'error', 'message': translate(error.message, language),
                    'fields': translate_fields(error.fields, language)}
        return None
    return {'type': 'error', 'message': 'Unknown event type.'}


def broadcast_action(raw, user_id):
    """What the socket of ``user_id`` does with a group broadcast: 'send', 'skip' (internal) or 'leave'."""
    try:
        event = json.loads(raw)
    except (TypeError, ValueError):
        return 'send'
    if not isinstance(event, dict) or event.get('type') != MEMBER_REMOVED:
        return 'send'
    return 'leave' if event.get('user_id') == user_id else 'skip'


def _release_db():
    """Give the database connection back to the pool: an open chat waits for hours."""
    db.session.close()


def announce_ready(pubsub, ws):
    """Wait for Redis to confirm the subscription made just before, then send "ready" to the client.

    ``subscribe`` only sends the command: until the confirmation arrives a message published by another
    request could still be missed. The confirmation is the first reply on the subscription and pubsub
    ignores it (ignore_subscribe_messages), so reading it returns None.
    """
    pubsub.get_message(timeout=SUBSCRIBE_CONFIRM_TIMEOUT_SEC)
    ws.send(json.dumps(READY))


def init_realtime(app):
    sock.init_app(app)

    @sock.route('/ws/chat/<int:group_id>')
    def chat_socket(ws, group_id):
        from app.api.chat import is_member

        if not current_user.is_authenticated or not is_member(current_user.id, group_id):
            ws.close(reason=CLOSE_POLICY_VIOLATION, message='Not a member of this group')
            return
        if not origin_allowed(request.headers.get('Origin'), request.host):
            ws.close(reason=CLOSE_POLICY_VIOLATION, message='Origin not allowed')
            return

        # plain values: the ORM user would reload itself (and take a DB connection) at every access
        user = SimpleNamespace(id=current_user.id, username=current_user.username, language=current_user.language)
        _release_db()

        socket_id = uuid.uuid4().hex
        if not register_socket(redis_client, user.id, socket_id):
            ws.send(json.dumps(TOO_MANY_SOCKETS))
            ws.close(reason=CLOSE_POLICY_VIOLATION, message='Too many chats open')
            return

        def leave():
            ws.send(json.dumps(NOT_A_MEMBER))
            ws.close(reason=CLOSE_POLICY_VIOLATION, message='Not a member of this group')

        pubsub = redis_client.pubsub(ignore_subscribe_messages=True)
        pubsub.subscribe(chat_channel(group_id))
        last_typing = 0.0
        next_check = time.monotonic() + MEMBERSHIP_CHECK_SEC
        try:
            announce_ready(pubsub, ws)
            while True:
                raw = ws.receive(timeout=RECEIVE_TIMEOUT_SEC)
                if raw is not None:
                    try:
                        if json.loads(raw).get('type') == 'typing':
                            if time.monotonic() - last_typing < TYPING_MIN_INTERVAL_SEC:
                                raw = None
                            else:
                                last_typing = time.monotonic()
                    except (TypeError, ValueError, AttributeError):
                        pass
                if raw is not None:
                    reply = handle_client_event(user, group_id, raw)
                    _release_db()
                    if reply is NOT_A_MEMBER:
                        leave()
                        return
                    if reply is not None:
                        ws.send(json.dumps(reply))
                while True:
                    event = pubsub.get_message(timeout=0)
                    if not event:
                        break
                    data = event.get('data')
                    data = data if isinstance(data, str) else data.decode()
                    action = broadcast_action(data, user.id)
                    if action == 'leave':
                        leave()
                        return
                    if action == 'send':
                        ws.send(data)
                if time.monotonic() >= next_check:  # in case a removal event was lost (Redis restart)
                    next_check = time.monotonic() + MEMBERSHIP_CHECK_SEC
                    refresh_socket(redis_client, user.id, socket_id)
                    still_member = is_member(user.id, group_id)
                    _release_db()
                    if not still_member:
                        leave()
                        return
        except Exception as error:  # noqa: BLE001 - client gone or server shutting down
            if error.__class__.__name__ != 'ConnectionClosed':
                current_app.logger.exception('Chat socket error for group=%s', group_id)
        finally:
            unregister_socket(redis_client, user.id, socket_id)
            try:
                pubsub.close()
            except Exception:  # noqa: BLE001
                pass
