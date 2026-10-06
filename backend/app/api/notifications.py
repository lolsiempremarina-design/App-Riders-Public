"""In-app notifications of the current user (created by the server: orders, SOS, groups, bikes)."""
from flask import jsonify, request
from flask_security import current_user

from app.api import api_bp
from app.api.stats import to_local
from app.api.utils import ValidationError, api_error, db_id_arg, json_body, login_required_json
from app.messaging.models import NOTIFICATION_CATEGORIES, Notification
from extensions import db

MAX_LIMIT = 100


def notification_to_dict(n):
    return {
        'id': n.id,
        'category': n.category,
        'title': n.title,
        'body': n.body,
        'link': n.link,
        'is_read': n.is_read,
        'created_at': to_local(n.created_at).isoformat(timespec='seconds'),
    }


def _mine():
    return Notification.query.filter_by(user_id=current_user.id)


def _unread_count():
    return _mine().filter_by(is_read=False).count()


@api_bp.get('/notifications')
@login_required_json
def list_notifications():
    try:
        limit = max(1, min(MAX_LIMIT, int(request.args.get('limit', 50))))
    except (TypeError, ValueError):
        limit = 50
    query = _mine()
    after = db_id_arg('after_id')
    if after is not None:  # only newer ones (used by the app to detect new notifications)
        query = query.filter(Notification.id > after)
    items = query.order_by(Notification.id.desc()).limit(limit).all()
    return jsonify({'notifications': [notification_to_dict(n) for n in items], 'unread_count': _unread_count()})


@api_bp.post('/notifications/<int:notification_id>/read')
@login_required_json
def mark_notification(notification_id):
    item = _mine().filter_by(id=notification_id).first()
    if item is None:
        return api_error(404, 'Notification not found.')
    item.is_read = bool(json_body().get('read', True))
    db.session.commit()
    return jsonify({'notification': notification_to_dict(item), 'unread_count': _unread_count()})


def _mine_in_category():
    """My notifications, only of ``?category=`` when given: "mark all" and "delete all" act on the category the
    app is showing. Before they always acted on every category, also with the filter "Sicurezza" on screen."""
    category = request.args.get('category')
    if category is None or category == '':
        return _mine()
    if category not in NOTIFICATION_CATEGORIES:
        raise ValidationError({'category': f"Category must be one of: {', '.join(NOTIFICATION_CATEGORIES)}."})
    return _mine().filter_by(category=category)


@api_bp.post('/notifications/read-all')
@login_required_json
def mark_all_notifications():
    _mine_in_category().filter_by(is_read=False).update({'is_read': True}, synchronize_session=False)
    db.session.commit()
    return jsonify({'unread_count': _unread_count()})


@api_bp.delete('/notifications/<int:notification_id>')
@login_required_json
def delete_notification(notification_id):
    item = _mine().filter_by(id=notification_id).first()
    if item is None:
        return api_error(404, 'Notification not found.')
    db.session.delete(item)
    db.session.commit()
    return jsonify({'success': True, 'unread_count': _unread_count()})


@api_bp.delete('/notifications')
@login_required_json
def clear_notifications():
    deleted = _mine_in_category().delete(synchronize_session=False)
    db.session.commit()
    return jsonify({'success': True, 'deleted': deleted, 'unread_count': _unread_count()})
