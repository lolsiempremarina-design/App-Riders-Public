"""SOS alerts from the React app (manual button or confirmed fall).

An SOS is always recorded. Emergency contacts with an email address are notified
when SMTP is configured; the response says exactly what was (and was not) sent so
the app can offer calls/SMS to the contacts instead of pretending they were alerted.
Members of the rider's groups get a notification (before the emails, which can be slow), see active alerts in
the app (/api/sos/active) and are told again when the rider cancels the SOS.
"""
import math
import uuid
from datetime import datetime, timedelta, timezone

from flask import current_app, jsonify
from flask_security import current_user

from app.api import api_bp
from app.api.serializers import sos_contact_to_dict
from app.api.stats import to_local
from app.api.utils import ValidationError, api_error, clean_str, json_body, login_required_json
from app.auth.models import GroupMembership, SOSAlert, SOSContact
from app.messaging.service import notify_text
from app.messaging.texts import text_language
from app.notifications import mail_configured, send_emails
from extensions import db

SOURCES = ('manual', 'fall')
DEDUP_WINDOW_SEC = 60          # repeated presses within a minute reuse the same alert
GROUP_VISIBILITY_HOURS = 6     # active alerts older than this are not shown to group members

MESSAGES = {
    'it': {
        'subject': 'SOS da {name}',
        'body': ('{name} ha inviato un SOS dall\'app RoR ({source}) alle {time}.\n\n{where}\n\n'
                 'Prova a chiamarlo subito{phone}. Se non risponde e pensi che sia in pericolo, chiama il 112.\n'),
        'where': 'Posizione: {url}',
        'no_where': 'Posizione non disponibile.',
        'fall': 'caduta rilevata', 'manual': 'pulsante SOS',
        'ok_subject': '{name} sta bene',
        'ok_body': '{name} ha annullato l\'SOS delle {time}: sta bene.\n',
    },
    'en': {
        'subject': 'SOS from {name}',
        'body': ('{name} sent an SOS from the RoR app ({source}) at {time}.\n\n{where}\n\n'
                 'Try to call them now{phone}. If they do not answer and you think they are in danger, call 112.\n'),
        'where': 'Location: {url}',
        'no_where': 'Location not available.',
        'fall': 'fall detected', 'manual': 'SOS button',
        'ok_subject': '{name} is OK',
        'ok_body': '{name} cancelled the SOS sent at {time}: they are fine.\n',
    },
    'es': {
        'subject': 'SOS de {name}',
        'body': ('{name} ha enviado un SOS desde la app RoR ({source}) a las {time}.\n\n{where}\n\n'
                 'Intenta llamarle ahora{phone}. Si no responde y crees que está en peligro, llama al 112.\n'),
        'where': 'Ubicación: {url}',
        'no_where': 'Ubicación no disponible.',
        'fall': 'caída detectada', 'manual': 'botón SOS',
        'ok_subject': '{name} está bien',
        'ok_body': '{name} ha cancelado el SOS de las {time}: está bien.\n',
    },
}


def _utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _map_url(alert):
    if alert.latitude is None or alert.longitude is None:
        return None
    return (f'https://www.openstreetmap.org/?mlat={alert.latitude:.6f}&mlon={alert.longitude:.6f}'
            f'#map=17/{alert.latitude:.6f}/{alert.longitude:.6f}')


def alert_to_dict(alert, with_user=False):
    data = {
        'id': alert.id,
        'source': alert.source,
        'status': alert.status,
        'lat': alert.latitude,
        'lon': alert.longitude,
        'accuracy_m': alert.accuracy_m,
        'map_url': _map_url(alert),
        'emails_sent': alert.emails_sent,
        'created_at': to_local(alert.created_at).isoformat(timespec='seconds'),
        'resolved_at': to_local(alert.resolved_at).isoformat(timespec='seconds') if alert.resolved_at else None,
    }
    if with_user:
        data['user_id'] = alert.user_id
        data['username'] = alert.user.username
        data['phone_number'] = alert.user.phone_number
    return data


def _texts(user):
    return MESSAGES[text_language(user.language)]  # same language rules as the app and the notifications


def _display_name(user):
    full = ' '.join(part for part in (user.first_name, user.last_name) if part)
    return full or user.full_name or user.username


def _notify_contacts(user, alert, contacts):
    emails = [c.email for c in contacts if c.email]
    if not emails:
        return 0, 0
    texts = _texts(user)
    name = _display_name(user)
    url = _map_url(alert)
    body = texts['body'].format(
        name=name,
        source=texts[alert.source],
        time=to_local(alert.created_at).strftime('%H:%M'),
        where=texts['where'].format(url=url) if url else texts['no_where'],
        phone=f' ({user.phone_number})' if user.phone_number else '',
    )
    return send_emails(emails, texts['subject'].format(name=name), body)


def _reused_alert_summary(alert, contacts):
    return {'email_configured': mail_configured(), 'emails_sent': alert.emails_sent,
            'emails_failed': 0, 'contacts_with_email': sum(1 for c in contacts if c.email)}


def create_sos_alert(user, source='manual', lat=None, lon=None, accuracy=None, session_id=None, request_id=None):
    """Record an SOS and notify contacts. Returns (alert, notification summary, created).

    ``request_id`` comes from the app and is the same in every automatic retry of one SOS: an attempt
    that already reached the server gets its alert back, whenever the retry arrives (the time window
    below only covers retries within a minute, and the app may stay without network much longer).
    """
    from app.auth.models import User  # local import, like the other models of this function

    # Lock the rider's row until the commit: SOS pressed twice at the same moment (or the button and a
    # fall together) run one after the other, so the second finds the first and the contacts and the
    # groups are alerted once.
    db.session.query(User.id).filter(User.id == user.id).with_for_update().one()
    contacts = (
        SOSContact.query.filter_by(user_id=user.id)
        .order_by(SOSContact.priority.desc(), SOSContact.id.asc()).all()
    )
    if request_id:
        same_request = SOSAlert.query.filter_by(user_id=user.id, request_id=request_id).first()
        if same_request is not None:
            db.session.rollback()  # releases the lock
            return same_request, _reused_alert_summary(same_request, contacts), False
    recent = (
        SOSAlert.query.filter(
            SOSAlert.user_id == user.id,
            SOSAlert.status == 'active',
            SOSAlert.created_at >= _utcnow() - timedelta(seconds=DEDUP_WINDOW_SEC),
        ).order_by(SOSAlert.created_at.desc()).first()
    )
    if recent is not None:
        if lat is not None and lon is not None:
            recent.latitude, recent.longitude, recent.accuracy_m = lat, lon, accuracy
            db.session.commit()
        return recent, _reused_alert_summary(recent, contacts), False

    alert = SOSAlert(user_id=user.id, source=source, latitude=lat, longitude=lon,
                     accuracy_m=accuracy, session_id=session_id or None, request_id=request_id or None,
                     created_at=_utcnow())
    db.session.add(alert)
    db.session.commit()
    current_app.logger.warning('SOS alert id=%s user=%s source=%s', alert.id, user.id, source)

    # The groups first: a notification in the app and a push, both immediate. The emails can take tens of
    # seconds when the mail server is slow or unreachable (SMTP_TIMEOUT_SEC for each step): before, they went
    # first and the riders nearby learned about the SOS only after them.
    _notify_groups(user, alert, 'sos_group' if alert.latitude is None else 'sos_group_on_map', link='/mappa')
    try:
        sent, failed = _notify_contacts(user, alert, contacts)
    except Exception:  # noqa: BLE001 - an emergency flow must not break because of the emails
        current_app.logger.exception('SOS emails failed for alert=%s', alert.id)
        sent, failed = 0, sum(1 for c in contacts if c.email)
    if sent:
        alert.emails_sent = sent
        db.session.commit()
    summary = {'email_configured': mail_configured(), 'emails_sent': sent, 'emails_failed': failed,
               'contacts_with_email': sum(1 for c in contacts if c.email)}
    return alert, summary, True


def _notify_groups(user, alert, key, link):
    """Notification ``key`` of the alert (sos_group, sos_group_on_map, sos_group_resolved) to the members of the
    rider's groups. Never raises: the emails to the contacts must leave anyway."""
    try:
        notify_text(_group_member_ids(user.id), 'sicurezza', key, link=link, name=_display_name(user),
                    username=user.username, time=to_local(alert.created_at).strftime('%H:%M'))
    except Exception:  # noqa: BLE001
        db.session.rollback()
        current_app.logger.exception('SOS group notification %s failed for alert=%s', key, alert.id)


def _group_member_ids(user_id):
    my_groups = db.session.query(GroupMembership.group_id).filter(GroupMembership.user_id == user_id)
    rows = (
        db.session.query(GroupMembership.user_id)
        .filter(GroupMembership.group_id.in_(my_groups), GroupMembership.user_id != user_id)
        .distinct().all()
    )
    return [row[0] for row in rows]


def _parse_coordinate(data, key, low, high):
    value = data.get(key)
    if value is None:
        return None
    if isinstance(value, bool):  # float(True) would be 1.0: a position in the sea off Africa
        raise ValidationError({key: 'Invalid coordinate.'})
    try:
        value = float(value)
    except (TypeError, ValueError):
        raise ValidationError({key: 'Invalid coordinate.'}) from None
    if not math.isfinite(value) or not low <= value <= high:
        raise ValidationError({key: 'Invalid coordinate.'})
    return value


def _parse_request_id(data):
    """Optional UUID of the app (older versions do not send it), stored in its canonical form."""
    value = data.get('request_id')
    if value is None or value == '':
        return None
    if not isinstance(value, str):
        raise ValidationError({'request_id': 'The SOS request id must be a UUID.'})
    try:
        return str(uuid.UUID(value))
    except ValueError:
        raise ValidationError({'request_id': 'The SOS request id must be a UUID.'}) from None


@api_bp.post('/sos')
@login_required_json
def trigger_sos():
    data = json_body()
    source = clean_str(data.get('source') or 'manual')
    if source not in SOURCES:
        raise ValidationError({'source': 'Source must be "manual" or "fall".'})
    lat = _parse_coordinate(data, 'lat', -90, 90)
    lon = _parse_coordinate(data, 'lon', -180, 180)
    if (lat is None) != (lon is None):
        raise ValidationError({'lat': 'Latitude and longitude must be sent together.'})
    accuracy = _parse_coordinate(data, 'accuracy_m', 0, 100000)
    session_id = clean_str(data.get('session_id'))[:255]
    request_id = _parse_request_id(data)

    user = current_user._get_current_object()
    alert, notifications, created = create_sos_alert(user, source, lat, lon, accuracy, session_id, request_id)
    contacts = (
        SOSContact.query.filter_by(user_id=user.id)
        .order_by(SOSContact.priority.desc(), SOSContact.id.asc()).all()
    )
    return jsonify({
        'alert': alert_to_dict(alert),
        'created': created,
        'notifications': {**notifications, 'group_members': len(_group_member_ids(user.id))},
        'contacts': [sos_contact_to_dict(c) for c in contacts],
    }), 201 if created else 200


@api_bp.post('/sos/<int:alert_id>/resolve')
@login_required_json
def resolve_sos(alert_id):
    alert = SOSAlert.query.filter_by(id=alert_id, user_id=current_user.id).first()
    if alert is None:
        return api_error(404, 'SOS not found.')
    # One UPDATE that only an active alert matches, so a single request resolves it: "Sto bene" tapped twice sends
    # two requests at the same moment, and before both found the alert active and the groups and the contacts were
    # told twice that the rider is fine. In PostgreSQL the second UPDATE waits for the first and then matches nothing.
    resolved_now = (
        SOSAlert.query.filter_by(id=alert.id, status='active')
        .update({'status': 'resolved', 'resolved_at': _utcnow()}, synchronize_session=False)
    )
    db.session.commit()  # also reloads ``alert`` with the values written by whichever request resolved it
    if resolved_now:
        user = current_user._get_current_object()
        # the groups got "SOS from ..." when it was sent: before, only the contacts with an email learned that the
        # rider is fine, the groups saw the alert disappear from the map and nothing else
        _notify_groups(user, alert, 'sos_group_resolved', link='/notifiche')
        if alert.emails_sent:
            texts = _texts(user)
            name = _display_name(user)
            emails = [c.email for c in SOSContact.query.filter_by(user_id=user.id) if c.email]
            send_emails(emails, texts['ok_subject'].format(name=name),
                        texts['ok_body'].format(name=name, time=to_local(alert.created_at).strftime('%H:%M')))
    return jsonify({'alert': alert_to_dict(alert)})


@api_bp.get('/sos/active')
@login_required_json
def active_sos():
    """My active SOS and the recent active SOS of members of my groups."""
    mine = (
        SOSAlert.query.filter_by(user_id=current_user.id, status='active')
        .order_by(SOSAlert.created_at.desc()).first()
    )
    member_ids = _group_member_ids(current_user.id)
    group_alerts = []
    if member_ids:
        group_alerts = (
            SOSAlert.query.filter(
                SOSAlert.user_id.in_(member_ids),
                SOSAlert.status == 'active',
                SOSAlert.created_at >= _utcnow() - timedelta(hours=GROUP_VISIBILITY_HOURS),
            ).order_by(SOSAlert.created_at.desc()).all()
        )
    return jsonify({
        'mine': alert_to_dict(mine) if mine else None,
        'groups': [alert_to_dict(a, with_user=True) for a in group_alerts],
    })
