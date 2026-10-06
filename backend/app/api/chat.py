"""Group chat: history and sending over HTTP (the WebSocket in app/realtime.py uses the same functions)."""
import math

from flask import jsonify
from flask_security import current_user
from sqlalchemy.orm import selectinload

from app.api import api_bp
from app.api.stats import to_local
from app.api.utils import ValidationError, api_error, clean_str, db_id_arg, json_body, login_required_json
from app.auth.models import GroupMembership
from app.messaging.models import ChatMessage
from app.messaging.service import publish_chat_event
from extensions import db

MAX_TEXT = 1000
PAGE_SIZE = 50


def message_to_dict(message):
    user = message.user
    return {
        'id': message.id,
        'group_id': message.group_id,
        'user_id': message.user_id,
        'username': user.username if user else None,
        'avatar': user.avatar if user else None,
        'kind': message.kind,
        'text': message.text,
        'lat': message.latitude,
        'lon': message.longitude,
        'created_at': to_local(message.created_at).isoformat(timespec='seconds'),
    }


def is_member(user_id, group_id):
    return GroupMembership.query.filter_by(user_id=user_id, group_id=group_id).first() is not None


def create_message(user_id, group_id, data):
    """Validate, save and broadcast a message. Raises ValidationError on bad input."""
    kind = clean_str(data.get('kind') or 'text')
    if kind == 'text':
        text = clean_str(data.get('text'))
        if not text:
            raise ValidationError({'text': 'The message is empty.'})
        if len(text) > MAX_TEXT:
            raise ValidationError({'text': f'At most {MAX_TEXT} characters.'})
        message = ChatMessage(group_id=group_id, user_id=user_id, kind='text', text=text)
    elif kind == 'location':
        try:
            if isinstance(data.get('lat'), bool) or isinstance(data.get('lon'), bool):
                raise TypeError('true/false is not a coordinate')
            lat, lon = float(data.get('lat')), float(data.get('lon'))
        except (TypeError, ValueError):
            raise ValidationError({'location': 'Latitude and longitude are required.'}) from None
        if not (math.isfinite(lat) and math.isfinite(lon) and -90 <= lat <= 90 and -180 <= lon <= 180):
            raise ValidationError({'location': 'Invalid coordinates.'})
        text = clean_str(data.get('text'))[:MAX_TEXT] or None
        message = ChatMessage(group_id=group_id, user_id=user_id, kind='location', text=text,
                              latitude=lat, longitude=lon)
    else:
        raise ValidationError({'kind': 'Kind must be "text" or "location".'})
    db.session.add(message)
    db.session.commit()
    payload = message_to_dict(message)
    publish_chat_event(group_id, {'type': 'message', 'message': payload})
    return payload


@api_bp.get('/groups/<int:group_id>/messages')
@login_required_json
def list_messages(group_id):
    if not is_member(current_user.id, group_id):
        return api_error(404, 'Group not found.')
    # the senders of the page in one query (before, one per sender)
    query = ChatMessage.query.filter_by(group_id=group_id).options(selectinload(ChatMessage.user))
    before = db_id_arg('before')
    if before is not None:
        query = query.filter(ChatMessage.id < before)
    page = query.order_by(ChatMessage.id.desc()).limit(PAGE_SIZE + 1).all()
    has_more = len(page) > PAGE_SIZE
    messages = [message_to_dict(m) for m in reversed(page[:PAGE_SIZE])]  # oldest first
    return jsonify({'messages': messages, 'has_more': has_more})


@api_bp.post('/groups/<int:group_id>/messages')
@login_required_json
def post_message(group_id):
    if not is_member(current_user.id, group_id):
        return api_error(404, 'Group not found.')
    return jsonify({'message': create_message(current_user.id, group_id, json_body())}), 201
