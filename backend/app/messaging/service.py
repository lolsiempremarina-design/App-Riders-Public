"""Creating notifications and publishing realtime chat events."""
import json

from flask import current_app

from app.auth.models import User
from app.messaging.models import NOTIFICATION_CATEGORIES, Notification
from app.messaging.texts import render, text_language
from app.push import queue_push
from extensions import db, redis_client


def notify(user_ids, category, title, body=None, link=None, commit=True):
    """Create one notification per user (duplicates and ``None`` are ignored).

    The same notification is pushed to the users' Android apps after the commit (app/push.py).
    """
    if category not in NOTIFICATION_CATEGORIES:
        raise ValueError(f'Unknown notification category: {category}')
    ids = [uid for uid in dict.fromkeys(user_ids) if uid is not None]
    for uid in ids:
        db.session.add(Notification(user_id=uid, category=category, title=title[:150],
                                    body=(body or '')[:1000] or None, link=link))
    queue_push(ids, category, title, body, link)
    if commit and ids:
        db.session.commit()
    return len(ids)


def notify_text(user_ids, category, key, link=None, commit=True, **values):
    """Like notify(), with the text ``key`` of app/messaging/texts.py in the language of each recipient
    (before, everybody got the Italian text, also in the app in English or Spanish)."""
    ids = [uid for uid in dict.fromkeys(user_ids) if uid is not None]
    languages = dict(db.session.query(User.id, User.language).filter(User.id.in_(ids))) if ids else {}
    by_language = {}
    for uid in ids:
        by_language.setdefault(text_language(languages.get(uid)), []).append(uid)
    for language, recipients in by_language.items():
        title, body = render(key, language, **values)
        notify(recipients, category, title, body, link, commit=False)
    if commit and ids:
        db.session.commit()
    return len(ids)


MEMBER_REMOVED = 'member_removed'  # internal event: closes the chat sockets of that user (not forwarded)


def chat_channel(group_id):
    return f'chat:{group_id}'


def publish_member_removed(group_id, user_id):
    """Call after the commit that removed ``user_id`` from the group: their open chats close at once."""
    publish_chat_event(group_id, {'type': MEMBER_REMOVED, 'user_id': user_id})


def publish_chat_event(group_id, event):
    """Broadcast an event to every WebSocket connected to the group (all Gunicorn workers)."""
    try:
        redis_client.publish(chat_channel(group_id), json.dumps(event))
    except Exception:  # noqa: BLE001 - the message is saved anyway; clients reload the history
        current_app.logger.exception('Unable to publish chat event for group=%s', group_id)
