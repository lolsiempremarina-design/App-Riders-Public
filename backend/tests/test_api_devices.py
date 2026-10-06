"""Phase 7 (Android app): push tokens, push delivery through FCM (mocked) and App Links."""
from datetime import timedelta

import pytest

from app import push
from app.api import devices as devices_api
from app.messaging.models import DeviceToken, utcnow
from app.messaging.service import notify
from extensions import db

TOKEN_A = 'fcmTokenAnna:APA91b' + 'a' * 60
TOKEN_B = 'fcmTokenBruno:APA91b' + 'b' * 60


def _login(client, email):
    client.post('/api/auth/logout')
    assert client.post('/api/auth/login', json={'identity': email, 'password': 'password'}).status_code == 200


@pytest.fixture
def people(app, user_factory):
    with app.app_context():
        created = {name: user_factory(f'{name}@example.com', name) for name in ('anna', 'bruno')}
        db.session.commit()
        return {name: u.id for name, u in created.items()}


def _tokens(app):
    with app.app_context():
        return {d.token: d.user_id for d in DeviceToken.query.all()}


@pytest.fixture
def push_on(monkeypatch):
    """Push "configured" without a key: the queued pushes are captured instead of leaving."""
    dispatched = []
    monkeypatch.setattr(push, 'push_configured', lambda app=None: True)
    monkeypatch.setattr(push, '_dispatch', lambda app, pending: dispatched.extend(pending))
    return dispatched


# ------------------------------------------------------------------ registration

def test_register_requires_login_and_valid_token(client, people):
    assert client.post('/api/devices', json={'token': TOKEN_A}).status_code == 401
    _login(client, 'anna@example.com')
    for body in ({}, {'token': 'short'}, {'token': 'x' * 600}, {'token': 'bad token with spaces ' * 3},
                 {'token': TOKEN_A, 'platform': 'ios'}):
        response = client.post('/api/devices', json=body)
        assert response.status_code == 422, body


def test_register_update_and_move_between_accounts(app, client, people):
    _login(client, 'anna@example.com')
    response = client.post('/api/devices', json={'token': TOKEN_A, 'platform': 'android'})
    assert response.get_json() == {'registered': True, 'push_enabled': False}  # no key in the tests
    with app.app_context():
        first_seen = DeviceToken.query.one().last_seen_at
    assert client.post('/api/devices', json={'token': TOKEN_A}).status_code == 200
    with app.app_context():
        assert DeviceToken.query.count() == 1
        assert DeviceToken.query.one().last_seen_at >= first_seen


def test_token_follows_the_account_logged_in_on_the_phone(app, client, people):
    # Anna's session ended without reaching the server (no network): her token is still there
    with app.app_context():
        db.session.add(DeviceToken(user_id=people['anna'], token=TOKEN_A))
        db.session.commit()
    _login(client, 'bruno@example.com')
    client.post('/api/devices', json={'token': TOKEN_A})
    assert _tokens(app) == {TOKEN_A: people['bruno']}


def test_unregister_only_removes_own_token(app, client, people):
    with app.app_context():
        db.session.add(DeviceToken(user_id=people['anna'], token=TOKEN_A))
        db.session.commit()
    _login(client, 'bruno@example.com')
    client.post('/api/devices', json={'token': TOKEN_B})
    assert client.delete('/api/devices', json={'token': TOKEN_A}).get_json() == {'success': True, 'removed': 0}
    assert client.delete('/api/devices', json={'token': TOKEN_B}).get_json() == {'success': True, 'removed': 1}
    assert _tokens(app) == {TOKEN_A: people['anna']}


def test_logout_forgets_the_phone_token(app, client, people):
    _login(client, 'anna@example.com')
    client.post('/api/devices', json={'token': TOKEN_A})
    assert _tokens(app) == {TOKEN_A: people['anna']}
    client.post('/api/auth/logout')
    assert _tokens(app) == {}


def test_password_change_stops_the_pushes_of_the_other_phones(app, client, people):
    """A lost or stolen phone is logged out by the new password: it must not keep receiving the pushes."""
    with app.app_context():
        db.session.add(DeviceToken(token=TOKEN_B, platform='android', user_id=people['anna']))  # the other phone
        db.session.commit()
    _login(client, 'anna@example.com')
    client.post('/api/devices', json={'token': TOKEN_A})  # this phone
    assert _tokens(app) == {TOKEN_A: people['anna'], TOKEN_B: people['anna']}
    changed = client.post('/api/profile/password', json={
        'current_password': 'password', 'new_password': 'NuovaPass123', 'new_password_confirm': 'NuovaPass123'})
    assert changed.status_code == 200
    assert _tokens(app) == {TOKEN_A: people['anna']}


def test_password_reset_by_the_admin_stops_all_pushes(app, people):
    with app.app_context():
        db.session.add(DeviceToken(token=TOKEN_A, platform='android', user_id=people['anna']))
        db.session.commit()
    result = app.test_cli_runner().invoke(args=['ror', 'reset-password', 'anna@example.com'])
    assert result.exit_code == 0, result.output
    assert _tokens(app) == {}


def test_account_deletion_removes_tokens(app, client, people):
    _login(client, 'anna@example.com')
    client.post('/api/devices', json={'token': TOKEN_A})
    assert client.post('/api/auth/delete-account', json={'password': 'password'}).status_code == 200
    assert _tokens(app) == {}


# ------------------------------------------------------------------ queue and delivery

def test_notify_pushes_only_after_commit(app, people, push_on):
    with app.app_context():
        notify([people['anna']], 'consegne', 'Nuovo ordine', 'Ritiro: Via A', link='/consegne', commit=False)
        assert push_on == []  # not committed yet
        db.session.rollback()
        assert push_on == []  # rolled back: never pushed
        notify([people['anna'], people['bruno'], people['anna']], 'sicurezza', 'SOS', link='/mappa')
    assert push_on == [{'user_ids': [people['anna'], people['bruno']], 'category': 'sicurezza', 'title': 'SOS',
                        'body': '', 'link': '/mappa'}]


def test_no_push_queued_without_key(app, people, monkeypatch):
    dispatched = []
    monkeypatch.setattr(push, '_dispatch', lambda app, pending: dispatched.extend(pending))
    with app.app_context():
        notify([people['anna']], 'sistema', 'Ciao')
    assert dispatched == []


def test_deliver_sends_to_every_device_and_drops_dead_tokens(app, people, monkeypatch):
    with app.app_context():
        db.session.add_all([DeviceToken(user_id=people['anna'], token=TOKEN_A),
                            DeviceToken(user_id=people['anna'], token=TOKEN_A + 'old'),
                            DeviceToken(user_id=people['bruno'], token=TOKEN_B)])
        db.session.commit()
    sent = []

    def fake_send(app_, token, item):
        sent.append((token, item['title']))
        return {TOKEN_A: 'sent', TOKEN_A + 'old': 'invalid'}.get(token, 'error')

    monkeypatch.setattr(push, 'send_message', fake_send)
    result = push.deliver(app, [{'user_ids': [people['anna']], 'category': 'gruppi', 'title': 'Nuovo membro',
                                 'body': '', 'link': '/gruppi'}])
    assert result == {'sent': 1, 'failed': 0, 'removed': 1}
    assert sorted(sent) == [(TOKEN_A, 'Nuovo membro'), (TOKEN_A + 'old', 'Nuovo membro')]
    assert _tokens(app) == {TOKEN_A: people['anna'], TOKEN_B: people['bruno']}


def test_build_message_opens_the_page_and_uses_the_category_channel():
    item = {'category': 'consegne', 'title': 'Nuovo ordine', 'body': 'Ritiro', 'link': '/consegne'}
    message = push.build_message(TOKEN_A, item)['message']
    assert message['token'] == TOKEN_A
    assert message['notification'] == {'title': 'Nuovo ordine', 'body': 'Ritiro'}
    assert message['data'] == {'link': '/consegne', 'category': 'consegne'}
    assert message['android'] == {'priority': 'high', 'notification': {'channel_id': 'consegne'}}
    assert push.build_message(TOKEN_A, dict(item, category='gruppi'))['message']['android']['priority'] == 'normal'


class _Response:
    def __init__(self, status, body=None):
        self.status_code = status
        self._body = body

    def json(self):
        if self._body is None:
            raise ValueError('no json')
        return self._body


class _Session:
    def __init__(self, response):
        self.response = response
        self.calls = []

    def post(self, url, json, timeout):
        self.calls.append((url, json))
        if isinstance(self.response, Exception):
            raise self.response
        return self.response


@pytest.mark.parametrize('response, outcome', [
    (_Response(200, {'name': 'projects/ror-rider/messages/1'}), 'sent'),
    (_Response(404, {'error': {'status': 'NOT_FOUND', 'details': [{'errorCode': 'UNREGISTERED'}]}}), 'invalid'),
    (_Response(403, {'error': {'status': 'PERMISSION_DENIED', 'details': [{'errorCode': 'SENDER_ID_MISMATCH'}]}}),
     'invalid'),
    (_Response(400, {'error': {'status': 'INVALID_ARGUMENT',
                               'message': 'The registration token is not a valid FCM registration token'}}), 'invalid'),
    (_Response(400, {'error': {'status': 'INVALID_ARGUMENT', 'message': 'Invalid JSON payload'}}), 'error'),
    (_Response(503, None), 'error'),
    (ConnectionError('offline'), 'error'),
])
def test_send_message_outcomes(app, monkeypatch, response, outcome):
    session = _Session(response)
    monkeypatch.setattr(push, '_client', lambda app_: (session, 'ror-rider'))
    item = {'category': 'sistema', 'title': 'Prova', 'body': '', 'link': '/notifiche'}
    assert push.send_message(app, TOKEN_A, item) == outcome
    assert session.calls[0][0] == 'https://fcm.googleapis.com/v1/projects/ror-rider/messages:send'


def test_send_test_push_command(app, runner, people, monkeypatch):
    result = runner.invoke(args=['ror', 'send-test-push', 'anna@example.com'])
    assert result.exit_code != 0 and 'disabled' in result.output
    monkeypatch.setattr(push, 'push_configured', lambda app=None: True)
    result = runner.invoke(args=['ror', 'send-test-push', 'anna@example.com'])
    assert result.exit_code != 0 and 'no Android app registered' in result.output
    with app.app_context():
        db.session.add(DeviceToken(user_id=people['anna'], token=TOKEN_A))
        db.session.commit()
    monkeypatch.setattr(push, 'send_message', lambda app_, token, item: 'sent')
    result = runner.invoke(args=['ror', 'send-test-push', 'anna@example.com'])
    assert result.exit_code == 0 and '1 sent' in result.output


# ------------------------------------------------------------------ privacy, retention, App Links

def test_export_privacy_and_purge_of_stale_tokens(app, client, runner, people):
    with app.app_context():
        db.session.add_all([
            DeviceToken(user_id=people['anna'], token=TOKEN_A),
            DeviceToken(user_id=people['anna'], token=TOKEN_A + 'old', last_seen_at=utcnow() - timedelta(days=90)),
        ])
        db.session.commit()
    _login(client, 'anna@example.com')
    devices = client.get('/api/account/export').get_json()['devices']
    assert [d['platform'] for d in devices] == ['android', 'android']
    assert all('token' not in d for d in devices)
    info = client.get('/api/legal/privacy').get_json()
    assert info['push_enabled'] is False and info['retention']['push_tokens_days'] == 60

    assert 'would delete 1 device_tokens' in runner.invoke(args=['ror', 'purge-expired', '--dry-run']).output
    runner.invoke(args=['ror', 'purge-expired'])
    assert _tokens(app) == {TOKEN_A: people['anna']}


def test_asset_links(app, client):
    assert client.get('/.well-known/assetlinks.json').status_code == 404
    app.config['ANDROID_CERT_SHA256'] = ['AA:BB:CC']
    response = client.get('/.well-known/assetlinks.json')
    assert response.status_code == 200
    assert response.get_json() == [{
        'relation': ['delegate_permission/common.handle_all_urls'],
        'target': {'namespace': 'android_app', 'package_name': 'com.ror.rider', 'sha256_cert_fingerprints': ['AA:BB:CC']},
    }]


def test_registration_reports_whether_the_server_sends_pushes(client, people, monkeypatch):
    monkeypatch.setattr(devices_api, 'push_configured', lambda app=None: True)
    _login(client, 'anna@example.com')
    assert client.post('/api/devices', json={'token': TOKEN_A}).get_json()['push_enabled'] is True
