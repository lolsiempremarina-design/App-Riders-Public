"""Phase 6 (GDPR): personal data export, privacy information, retention and SMTP test commands."""
import json
from datetime import datetime, timedelta

import pytest

from app.api import account as account_api
from app.auth.models import FallEvent, Group, GroupMembership, RiderShift, SOSAlert, SOSContact, User
from app.delivery.models import Order, utcnow
from app.messaging.models import ChatMessage, Notification
from extensions import db


def _login(client, email):
    client.post('/api/auth/logout')
    assert client.post('/api/auth/login', json={'identity': email, 'password': 'password'}).status_code == 200


class _FakeRedis:
    def __init__(self, values):
        self.values = values

    def get(self, key):
        return self.values.get(key)


@pytest.fixture
def people(app, user_factory):
    with app.app_context():
        anna = user_factory('anna@example.com', 'anna')
        bruno = user_factory('bruno@example.com', 'bruno')
        db.session.commit()
        return {'anna': anna.id, 'bruno': bruno.id}


def test_export_requires_login(client):
    assert client.get('/api/account/export').status_code == 401


def test_export_contains_only_my_data(app, client, people, monkeypatch):
    monkeypatch.setattr(account_api, 'redis_client', _FakeRedis(
        {f"position:{people['anna']}": json.dumps({'lat': 45.46, 'lon': 9.19}),
         f"group_position:{people['anna']}": json.dumps({'lat': 45.47, 'lon': 9.2})}))
    with app.app_context():
        group = Group(name='Navigli', code='abc-defg-hij')
        db.session.add(group)
        db.session.flush()
        db.session.add_all([
            GroupMembership(user_id=people['anna'], group_id=group.id, role='owner'),
            SOSContact(user_id=people['anna'], name='Maria', phone='+39 333 1111111', email='maria@example.com'),
            RiderShift(user_id=people['anna'], session_id='s1', gpx_path='/data/x.gpx', total_distance_km=3.2,
                       duration_min=15, started_at=datetime(2026, 9, 20, 8, 0)),
            FallEvent(user_id=people['anna'], session_id='s1', latitude=45.1, longitude=9.1),
            SOSAlert(user_id=people['anna'], source='manual', status='resolved', latitude=45.2, longitude=9.2),
            Order(restaurant_name='Trattoria', pickup_address='Via A 1', delivery_address='Via B 2',
                  customer_name='Luca Cliente', pay=5, bonus=1, status='delivered', rider_id=people['anna'],
                  delivered_at=utcnow()),
            Notification(user_id=people['anna'], category='sistema', title='Ciao'),
            Notification(user_id=people['bruno'], category='sistema', title='Di Bruno'),
            ChatMessage(user_id=people['anna'], group_id=group.id, kind='text', text='Arrivo'),
            ChatMessage(user_id=people['bruno'], group_id=group.id, kind='text', text='Messaggio di Bruno'),
        ])
        db.session.commit()

    _login(client, 'anna@example.com')
    response = client.get('/api/account/export')
    assert response.status_code == 200
    assert response.headers['Content-Disposition'].startswith('attachment; filename="ror-dati-personali-anna-')
    assert response.headers['Cache-Control'] == 'no-store'
    data = json.loads(response.data)
    assert data['account']['email'] == 'anna@example.com'
    assert [c['name'] for c in data['sos_contacts']] == ['Maria']
    assert data['groups'][0]['name'] == 'Navigli' and data['groups'][0]['role'] == 'owner'
    assert data['routes'][0]['distance_km'] == 3.2 and data['routes'][0]['gpx_download'].endswith('/gpx')
    assert data['fall_events'][0]['lat'] == 45.1
    assert data['sos_alerts'][0]['status'] == 'resolved'
    assert data['orders'][0]['restaurant'] == 'Trattoria'
    assert 'customer_name' not in data['orders'][0]  # data of another person
    assert [n['title'] for n in data['notifications']] == ['Ciao']
    assert [m['text'] for m in data['chat_messages']] == ['Arrivo']
    assert data['live_position'] == {'lat': 45.46, 'lon': 9.19}
    assert data['shared_map_position'] == {'lat': 45.47, 'lon': 9.2}  # the map sharing, kept 90 s too
    assert 'password' not in json.dumps(data['account'])


def test_privacy_information_comes_from_the_configuration(app, client):
    info = client.get('/api/legal/privacy').get_json()
    assert info['controller'] == {'name': None, 'email': None, 'configured': False}
    assert info['retention']['notifications_days'] == 180
    assert info['retention']['routes_days'] == 0
    assert info['sos_email_enabled'] is False

    # a mail server without sender and account sends nothing: the Privacy page must not claim SOS emails
    app.config.update(MAIL_SERVER='smtp.gmail.com')
    assert client.get('/api/legal/privacy').get_json()['sos_email_enabled'] is False
    app.config.update(MAIL_FROM='RoR <ror.avvisi@example.com>')
    assert client.get('/api/legal/privacy').get_json()['sos_email_enabled'] is True

    app.config.update(PRIVACY_CONTROLLER_NAME='Cooperativa Rider', PRIVACY_CONTACT_EMAIL='privacy@example.com',
                      ROUTE_RETENTION_DAYS=730, BACKUP_KEEP_DAYS=21)
    info = client.get('/api/legal/privacy').get_json()
    assert info['controller'] == {'name': 'Cooperativa Rider', 'email': 'privacy@example.com', 'configured': True}
    assert info['retention']['routes_days'] == 730
    # deleted accounts remain in the backups until they are rotated (public account deletion page)
    assert info['retention']['backups_days'] == 21


def test_admin_deletes_an_account_on_request(app, user_factory, monkeypatch):
    """`flask ror delete-account`: requests sent by email (public page /eliminazione-account)."""
    monkeypatch.setattr('extensions.redis_client.delete', lambda *_keys: 1)
    with app.app_context():
        user_factory('leaving@example.com', 'leaving')
        db.session.commit()
    runner = app.test_cli_runner()

    kept = runner.invoke(args=['ror', 'delete-account', 'leaving@example.com'], input='n\n')
    assert kept.exit_code != 0
    with app.app_context():
        assert User.query.filter_by(email='leaving@example.com').count() == 1

    result = runner.invoke(args=['ror', 'delete-account', 'LEAVING@example.com', '--yes'])
    assert result.exit_code == 0, result.output
    assert 'deleted' in result.output
    with app.app_context():
        assert User.query.filter_by(email='leaving@example.com').count() == 0


def test_purge_expired_applies_retention(app, people, tmp_path):
    app.config.update(GPX_STORAGE_DIR=str(tmp_path), ROUTE_RETENTION_DAYS=30, NOTIFICATION_RETENTION_DAYS=10,
                      SOS_RETENTION_DAYS=10, CHAT_RETENTION_DAYS=0)
    old = utcnow() - timedelta(days=40)
    old_gpx = tmp_path / 'old.gpx'
    old_gpx.write_text('<gpx/>')
    with app.app_context():
        group = Group(name='G', code='zzz-zzzz-zzz')
        db.session.add(group)
        db.session.flush()
        db.session.add_all([
            RiderShift(user_id=people['anna'], session_id='old', gpx_path=str(old_gpx), created_at=old),
            RiderShift(user_id=people['anna'], session_id='new', gpx_path=str(tmp_path / 'new.gpx')),
            FallEvent(user_id=people['anna'], session_id='old', latitude=1, longitude=1, timestamp=old),
            # a fall of a session never closed (no route): same retention as the routes
            FallEvent(user_id=people['anna'], session_id='never-closed', latitude=1, longitude=1, timestamp=old),
            Notification(user_id=people['anna'], category='sistema', title='vecchia', created_at=old),
            Notification(user_id=people['anna'], category='sistema', title='nuova'),
            SOSAlert(user_id=people['anna'], created_at=old),
            ChatMessage(user_id=people['anna'], group_id=group.id, text='resta', created_at=old),
        ])
        db.session.commit()

    runner = app.test_cli_runner()
    dry = runner.invoke(args=['ror', 'purge-expired', '--dry-run'])
    assert 'would delete 1 notifications' in dry.output and old_gpx.exists()

    result = runner.invoke(args=['ror', 'purge-expired'])
    assert result.exit_code == 0, result.output
    with app.app_context():
        assert [s.session_id for s in RiderShift.query] == ['new']
        assert FallEvent.query.count() == 0
        assert [n.title for n in Notification.query] == ['nuova']
        assert SOSAlert.query.count() == 0
        assert ChatMessage.query.count() == 1  # CHAT_RETENTION_DAYS=0: kept
    assert not old_gpx.exists()


def test_send_test_email_without_smtp_fails_clearly(app):
    result = app.test_cli_runner().invoke(args=['ror', 'send-test-email', 'me@example.com'])
    assert result.exit_code != 0 and 'MAIL_SERVER' in result.output


def test_production_refuses_example_secrets():
    from app import create_app
    from tests.conftest import TestConfig

    class Production(TestConfig):
        TESTING = False
        APP_ENV = 'production'
        SECRET_KEY = 'change-me-generate-a-long-random-secret'
        SECURITY_PASSWORD_SALT = 'x' * 40
        SESSION_COOKIE_SECURE = False

    with pytest.raises(RuntimeError) as error:
        create_app(Production)
    assert 'SECRET_KEY' in str(error.value) and 'SESSION_COOKIE_SECURE' in str(error.value)
    assert 'SECURITY_PASSWORD_SALT' not in str(error.value)

    class Good(Production):
        SECRET_KEY = 'k' * 48
        SESSION_COOKIE_SECURE = True
        REMEMBER_COOKIE_SECURE = True

    assert create_app(Good).config['APP_ENV'] == 'production'
