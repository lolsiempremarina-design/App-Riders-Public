"""Personal data (GDPR): export of everything stored about the user (art. 15 and 20) and the
privacy information the app shows (data controller, retention periods).

The data controller and the retention periods come from the configuration (.env): nothing
here is invented. When the controller is not configured the app says so.
"""
import json
from datetime import datetime, timezone

from flask import Response, current_app, jsonify
from flask_security import current_user

from app.api import api_bp
from app.api.routes_history import route_to_dict
from app.api.serializers import sos_contact_to_dict, user_to_dict
from app.api.sos import alert_to_dict
from app.api.stats import to_local
from app.api.utils import login_required_json
from app.auth.models import FallEvent, GroupMembership, RiderShift, SOSAlert, SOSContact
from app.delivery.models import Order
from app.messaging.models import ChatMessage, DeviceToken, Notification
from app.notifications import mail_configured
from app.push import push_configured
from extensions import redis_client


def _iso(value):
    return to_local(value).isoformat(timespec='seconds') if value else None


def _live_position(user_id, key='position'):
    """The live position kept in Redis for 90 s: 'position' (GPS session) or 'group_position' (map sharing)."""
    try:
        raw = redis_client.get(f'{key}:{user_id}')
    except Exception:  # noqa: BLE001 - Redis down: the export still works without it
        current_app.logger.exception('Unable to read the live position for the export')
        return None
    if not raw:
        return None
    try:
        return json.loads(raw)
    except (TypeError, ValueError):
        return None


def build_export(user):
    """Every personal record of ``user`` as a JSON-serializable dict (local times)."""
    account = user_to_dict(user)
    orders = Order.query.filter_by(rider_id=user.id).order_by(Order.created_at).all()
    memberships = GroupMembership.query.filter_by(user_id=user.id).all()
    return {
        'format': 'ror-personal-data-export',
        'version': 2,  # 2: no more "activities" (the table was removed, routes hold every ride)
        'exported_at': _iso(datetime.now(timezone.utc)),
        'timezone': current_app.config['APP_TIMEZONE'],
        'account': account,
        'sos_contacts': [sos_contact_to_dict(c) for c in
                         SOSContact.query.filter_by(user_id=user.id).order_by(SOSContact.priority)],
        'groups': [{
            'group_id': m.group_id,
            'name': m.group.name if m.group else None,
            'role': m.role,
            'joined_at': _iso(m.joined_at),
        } for m in memberships],
        'routes': [dict(route_to_dict(s), gpx_download=f'/api/routes/{s.id}/gpx' if s.gpx_path else None)
                   for s in RiderShift.query.filter_by(user_id=user.id).order_by(RiderShift.created_at)],
        'fall_events': [{
            'session_id': f.session_id,
            'lat': f.latitude,
            'lon': f.longitude,
            'time': _iso(f.timestamp),
        } for f in FallEvent.query.filter_by(user_id=user.id).order_by(FallEvent.timestamp)],
        'sos_alerts': [alert_to_dict(a) for a in
                       SOSAlert.query.filter_by(user_id=user.id).order_by(SOSAlert.created_at)],
        # Customer names are data of other people: the rider's copy keeps only the work done.
        'orders': [{
            'id': o.id,
            'restaurant': o.restaurant_name,
            'pickup_address': o.pickup_address,
            'delivery_address': o.delivery_address,
            'status': o.status,
            'pay': float(o.pay or 0),
            'bonus': float(o.bonus or 0),
            'accepted_at': _iso(o.accepted_at),
            'picked_up_at': _iso(o.picked_up_at),
            'delivered_at': _iso(o.delivered_at),
        } for o in orders],
        'notifications': [{
            'category': n.category,
            'title': n.title,
            'body': n.body,
            'is_read': n.is_read,
            'created_at': _iso(n.created_at),
        } for n in Notification.query.filter_by(user_id=user.id).order_by(Notification.id)],
        'chat_messages': [{
            'group_id': m.group_id,
            'kind': m.kind,
            'text': m.text,
            'lat': m.latitude,
            'lon': m.longitude,
            'created_at': _iso(m.created_at),
        } for m in ChatMessage.query.filter_by(user_id=user.id).order_by(ChatMessage.id)],
        # installations of the Android app that receive push notifications (the token itself is not useful to the rider)
        'devices': [{
            'platform': d.platform,
            'registered_at': _iso(d.created_at),
            'last_seen_at': _iso(d.last_seen_at),
        } for d in DeviceToken.query.filter_by(user_id=user.id).order_by(DeviceToken.id)],
        'bike': ({'code': user.bike.bike_id, 'label': user.bike.label} if user.bike else None),
        'live_position': _live_position(user.id),
        'shared_map_position': _live_position(user.id, 'group_position'),
    }


@api_bp.get('/account/export')
@login_required_json
def export_account():
    user = current_user._get_current_object()
    data = build_export(user)
    filename = f"ror-dati-personali-{user.username}-{datetime.now(timezone.utc):%Y%m%d}.json"
    response = Response(json.dumps(data, ensure_ascii=False, indent=2), mimetype='application/json')
    response.headers['Content-Disposition'] = f'attachment; filename="{filename}"'
    return response


def retention_policy(config):
    """Retention periods in days (0 = kept until the user deletes them or the account)."""
    return {
        'live_position_sec': int(config.get('POSITION_TTL', 90)),
        'routes_days': config['ROUTE_RETENTION_DAYS'],
        'notifications_days': config['NOTIFICATION_RETENTION_DAYS'],
        'sos_alerts_days': config['SOS_RETENTION_DAYS'],
        'chat_messages_days': config['CHAT_RETENTION_DAYS'],
        'backups_days': config['BACKUP_KEEP_DAYS'],
        'push_tokens_days': config['PUSH_TOKEN_STALE_DAYS'],
    }


@api_bp.get('/legal/privacy')
def privacy_information():
    """Public: who is responsible for the data and how long it is kept (from the configuration)."""
    config = current_app.config
    name = config['PRIVACY_CONTROLLER_NAME']
    email = config['PRIVACY_CONTACT_EMAIL']
    return jsonify({
        'controller': {'name': name or None, 'email': email or None, 'configured': bool(name and email)},
        'retention': retention_policy(config),
        # same check as the SOS (server and sender): a server alone does not send anything
        'sos_email_enabled': mail_configured(),
        'push_enabled': push_configured(),
    })
