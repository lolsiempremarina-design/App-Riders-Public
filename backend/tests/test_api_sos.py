"""SOS API (phase 4): recording, email notification, dedup, resolve and group visibility."""
from datetime import datetime, timedelta, timezone

import pytest

from app import notifications
from app.auth.models import SOSAlert, SOSContact
from extensions import db


class FakeSMTP:
    instances = []

    def __init__(self, host, port, timeout=None):
        self.host, self.port = host, port
        self.messages = []
        self.logged_in = None
        self.tls = False
        FakeSMTP.instances.append(self)

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def starttls(self):
        self.tls = True

    def login(self, username, password):
        self.logged_in = username

    def send_message(self, message):
        self.messages.append(message)


@pytest.fixture
def smtp(app, monkeypatch):
    FakeSMTP.instances = []
    monkeypatch.setattr(notifications.smtplib, 'SMTP', FakeSMTP)
    app.config.update(MAIL_SERVER='smtp.example.com', MAIL_PORT=587, MAIL_USE_TLS=True,
                      MAIL_USERNAME='ror@example.com', MAIL_PASSWORD='x', MAIL_FROM='ror@example.com')
    return FakeSMTP


def _login(client, email):
    client.post('/api/auth/logout')
    assert client.post('/api/auth/login', json={'identity': email, 'password': 'password'}).status_code == 200


@pytest.fixture
def rider(app, user_factory):
    with app.app_context():
        user = user_factory('rider@example.com', 'rider_sos', first_name='Mario', last_name='Rossi',
                            phone_number='+39 333 1234567', language='it')
        db.session.flush()
        db.session.add_all([
            SOSContact(user_id=user.id, name='Anna', phone='+39 333 0000001', email='anna@example.com', priority=2),
            SOSContact(user_id=user.id, name='Luca', phone='+39 333 0000002', priority=1),
        ])
        db.session.commit()
        return user.id


def test_sos_requires_login(client):
    assert client.post('/api/sos', json={}).status_code == 401
    assert client.get('/api/sos/active').status_code == 401


def test_sos_without_smtp_is_recorded_and_says_nothing_was_sent(app, client, rider):
    _login(client, 'rider@example.com')
    response = client.post('/api/sos', json={'source': 'manual', 'lat': 45.46, 'lon': 9.19, 'accuracy_m': 12})
    assert response.status_code == 201
    body = response.get_json()
    assert body['created'] is True
    assert body['alert']['status'] == 'active'
    assert body['alert']['map_url'].startswith('https://www.openstreetmap.org/?mlat=45.460000&mlon=9.190000')
    assert body['notifications'] == {'email_configured': False, 'emails_sent': 0, 'emails_failed': 0,
                                     'contacts_with_email': 1, 'group_members': 0}
    # contacts are returned so the app can offer calls / SMS
    assert [c['name'] for c in body['contacts']] == ['Anna', 'Luca']
    with app.app_context():
        assert SOSAlert.query.count() == 1


def test_sos_emails_contacts_and_deduplicates(app, client, rider, smtp):
    _login(client, 'rider@example.com')
    first = client.post('/api/sos', json={'source': 'fall', 'lat': 45.46, 'lon': 9.19}).get_json()
    assert first['notifications']['emails_sent'] == 1
    message = smtp.instances[0].messages[0]
    assert message['To'] == 'anna@example.com'
    assert message['Subject'] == 'SOS da Mario Rossi'
    assert 'caduta rilevata' in message.get_content()
    assert '+39 333 1234567' in message.get_content()
    assert 'openstreetmap.org' in message.get_content()
    assert smtp.instances[0].tls and smtp.instances[0].logged_in == 'ror@example.com'

    # a second press within a minute reuses the alert (no duplicate emails) and updates the position
    again = client.post('/api/sos', json={'source': 'manual', 'lat': 45.47, 'lon': 9.2})
    assert again.status_code == 200
    assert again.get_json()['created'] is False
    assert again.get_json()['alert']['id'] == first['alert']['id']
    assert again.get_json()['alert']['lat'] == 45.47
    assert len(smtp.instances) == 1

    resolved = client.post(f"/api/sos/{first['alert']['id']}/resolve").get_json()['alert']
    assert resolved['status'] == 'resolved' and resolved['resolved_at']
    assert smtp.instances[1].messages[0]['Subject'] == 'Mario Rossi sta bene'


def test_smtp_failure_does_not_break_the_sos(app, client, rider, monkeypatch):
    def broken(*args, **kwargs):
        raise OSError('connection refused')

    monkeypatch.setattr(notifications.smtplib, 'SMTP', broken)
    app.config.update(MAIL_SERVER='smtp.example.com', MAIL_FROM='ror@example.com')
    _login(client, 'rider@example.com')
    body = client.post('/api/sos', json={}).get_json()
    assert body['created'] is True
    assert body['alert']['lat'] is None
    assert body['notifications']['emails_sent'] == 0
    assert body['notifications']['emails_failed'] == 1


def test_sos_validation(client, rider):
    _login(client, 'rider@example.com')
    assert client.post('/api/sos', json={'source': 'boom'}).status_code == 422
    assert client.post('/api/sos', json={'lat': 45.4}).status_code == 422
    assert client.post('/api/sos', json={'lat': 95, 'lon': 9}).status_code == 422


def test_group_members_see_active_sos(app, client, rider, user_factory):
    with app.app_context():
        user_factory('friend@example.com', 'friend_user')
        user_factory('stranger@example.com', 'stranger_user')
        db.session.commit()

    _login(client, 'rider@example.com')
    group = client.post('/api/groups', json={'name': 'Navigli'}).get_json()
    alert = client.post('/api/sos', json={'lat': 45.46, 'lon': 9.19}).get_json()['alert']
    assert client.get('/api/sos/active').get_json()['mine']['id'] == alert['id']

    _login(client, 'friend@example.com')
    client.post('/api/groups/join', json={'code': group['code']})
    seen = client.get('/api/sos/active').get_json()
    assert seen['mine'] is None
    assert [(a['username'], a['lat']) for a in seen['groups']] == [('rider_sos', 45.46)]
    assert client.post(f"/api/sos/{alert['id']}/resolve").status_code == 404  # not theirs

    _login(client, 'stranger@example.com')
    assert client.get('/api/sos/active').get_json()['groups'] == []

    # resolved or old alerts disappear
    _login(client, 'rider@example.com')
    client.post(f"/api/sos/{alert['id']}/resolve")
    with app.app_context():
        db.session.add(SOSAlert(user_id=rider, created_at=datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=7)))
        db.session.commit()
    _login(client, 'friend@example.com')
    assert client.get('/api/sos/active').get_json()['groups'] == []


def test_deleting_account_removes_sos_alerts(app, client, rider):
    _login(client, 'rider@example.com')
    client.post('/api/sos', json={})
    assert client.post('/api/auth/delete-account', json={'password': 'password'}).status_code == 200
    with app.app_context():
        assert SOSAlert.query.count() == 0


def test_sos_refuses_true_and_false_as_coordinates(client, rider):
    _login(client, 'rider@example.com')
    response = client.post('/api/sos', json={'lat': True, 'lon': True})
    assert response.status_code == 422
    assert set(response.get_json()['fields']) == {'lat'}


def test_a_line_break_in_the_name_does_not_break_the_sos(app, client, rider, smtp, user_factory):
    """Registration now refuses it; an older account with a line break in the name must still alert everyone."""
    from app.auth.models import Group, GroupMembership, User
    from app.messaging.models import Notification

    with app.app_context():
        user = db.session.get(User, rider)
        user.first_name = 'Ma\nrio'
        friend = user_factory('friend@example.com', 'friend_sos')
        group = Group(name='Navigli', code='abc-defg-hij')
        db.session.add(group)
        db.session.flush()
        db.session.add_all([GroupMembership(user_id=rider, group_id=group.id, role='owner'),
                            GroupMembership(user_id=friend.id, group_id=group.id, role='member')])
        db.session.commit()
        friend_id = friend.id

    _login(client, 'rider@example.com')
    response = client.post('/api/sos', json={'source': 'manual', 'lat': 45.46, 'lon': 9.19})
    assert response.status_code == 201
    assert response.get_json()['notifications']['emails_sent'] == 1
    subject = smtp.instances[0].messages[0]['Subject']
    assert '\n' not in subject and subject == 'SOS da Ma rio Rossi'
    with app.app_context():
        assert Notification.query.filter_by(user_id=friend_id, category='sicurezza').count() == 1


def test_the_groups_are_alerted_even_if_the_emails_crash(app, client, rider, smtp, monkeypatch, user_factory):
    from app.api import sos as sos_api
    from app.auth.models import Group, GroupMembership
    from app.messaging.models import Notification

    with app.app_context():
        friend = user_factory('friend2@example.com', 'friend_two')
        group = Group(name='Isola', code='abc-defg-hik')
        db.session.add(group)
        db.session.flush()
        db.session.add_all([GroupMembership(user_id=rider, group_id=group.id, role='owner'),
                            GroupMembership(user_id=friend.id, group_id=group.id, role='member')])
        db.session.commit()
        friend_id = friend.id

    def broken(*args, **kwargs):
        raise RuntimeError('mail server exploded')

    monkeypatch.setattr(sos_api, 'send_emails', broken)
    _login(client, 'rider@example.com')
    response = client.post('/api/sos', json={'source': 'fall'})
    assert response.status_code == 201
    assert response.get_json()['notifications']['emails_failed'] == 1
    with app.app_context():
        assert Notification.query.filter_by(user_id=friend_id, category='sicurezza').count() == 1


REQUEST_ID = '3f2b8c1e-9a4d-4e6f-8b7a-1c2d3e4f5a6b'


def test_retry_with_the_same_request_id_returns_the_same_alert_even_after_the_dedup_window(app, client, rider, smtp):
    """The app retries an SOS by itself until it gets through. When the first attempt reached the server and
    only the answer was lost, a retry minutes later (no network in the meantime) must not alert twice."""
    _login(client, 'rider@example.com')
    first = client.post('/api/sos', json={'source': 'fall', 'lat': 45.46, 'lon': 9.19, 'request_id': REQUEST_ID})
    assert first.status_code == 201
    with app.app_context():  # beyond the one-minute window of repeated presses
        alert = db.session.get(SOSAlert, first.get_json()['alert']['id'])
        alert.created_at -= timedelta(minutes=10)
        db.session.commit()

    retry = client.post('/api/sos', json={'source': 'fall', 'request_id': REQUEST_ID.upper()})
    assert retry.status_code == 200
    assert retry.get_json()['created'] is False
    assert retry.get_json()['alert']['id'] == first.get_json()['alert']['id']
    assert len(smtp.instances) == 1  # the contacts got one email, not two
    with app.app_context():
        assert SOSAlert.query.count() == 1


def test_a_new_sos_after_the_window_with_another_request_id_is_a_new_alert(app, client, rider):
    _login(client, 'rider@example.com')
    first = client.post('/api/sos', json={'request_id': REQUEST_ID}).get_json()
    with app.app_context():
        alert = db.session.get(SOSAlert, first['alert']['id'])
        alert.created_at -= timedelta(minutes=10)
        db.session.commit()
    second = client.post('/api/sos', json={'request_id': '9d8c7b6a-5f4e-4d3c-8b2a-1f0e9d8c7b6a'})
    assert second.status_code == 201
    assert second.get_json()['alert']['id'] != first['alert']['id']


def test_sos_request_id_validation(client, rider):
    _login(client, 'rider@example.com')
    for bad in ('not-a-uuid', 123, ['x'], True):
        response = client.post('/api/sos', json={'request_id': bad})
        assert response.status_code == 422, bad
        assert 'request_id' in response.get_json()['fields']
    # older versions of the app send no request id at all
    assert client.post('/api/sos', json={}).status_code == 201


def _group_with(app, rider, user_factory, friend_email, friend_username, language='en'):
    """A group of the rider with one friend; returns the friend's id."""
    from app.auth.models import Group, GroupMembership

    with app.app_context():
        friend = user_factory(friend_email, friend_username, language=language)
        group = Group(name='Navigli', code='abc-defg-hij')
        db.session.add(group)
        db.session.flush()
        db.session.add_all([GroupMembership(user_id=rider, group_id=group.id, role='owner'),
                            GroupMembership(user_id=friend.id, group_id=group.id, role='member')])
        db.session.commit()
        return friend.id


def test_the_groups_are_alerted_before_the_emails_leave(app, client, rider, smtp, monkeypatch, user_factory):
    """With a slow or unreachable mail server the emails take tens of seconds: the riders nearby must not wait."""
    from app.api import sos as sos_api
    from app.messaging.models import Notification

    friend_id = _group_with(app, rider, user_factory, 'friend3@example.com', 'friend_three')
    seen_by_the_emails = []
    real_send = sos_api.send_emails

    def send_and_look(*args, **kwargs):
        seen_by_the_emails.append(Notification.query.filter_by(user_id=friend_id, category='sicurezza').count())
        return real_send(*args, **kwargs)

    monkeypatch.setattr(sos_api, 'send_emails', send_and_look)
    _login(client, 'rider@example.com')
    assert client.post('/api/sos', json={'lat': 45.46, 'lon': 9.19}).status_code == 201
    assert seen_by_the_emails == [1]  # the group notification was already there when the emails started


def test_cancelling_the_sos_tells_the_groups_that_the_rider_is_fine(app, client, rider, smtp, user_factory):
    from app.messaging.models import Notification

    friend_id = _group_with(app, rider, user_factory, 'friend4@example.com', 'friend_four', language='es')
    _login(client, 'rider@example.com')
    alert = client.post('/api/sos', json={}).get_json()['alert']
    assert client.post(f"/api/sos/{alert['id']}/resolve").status_code == 200
    assert client.post(f"/api/sos/{alert['id']}/resolve").status_code == 200  # again: nothing new is sent

    with app.app_context():
        titles = [n.title for n in Notification.query.filter_by(user_id=friend_id, category='sicurezza')
                  .order_by(Notification.id)]
        assert titles == ['🚨 SOS de Mario Rossi', '✅ Mario Rossi está bien']  # in the friend's language
        assert Notification.query.filter_by(user_id=rider).count() == 0  # not to the rider who cancelled
    # the contacts with an email: the alert and then "is fine"
    assert [m['Subject'] for s in smtp.instances for m in s.messages] == ['SOS da Mario Rossi', 'Mario Rossi sta bene']


def test_two_cancels_at_the_same_moment_tell_the_groups_once(app, client, rider, smtp, monkeypatch, user_factory):
    """"Sto bene" tapped twice: two requests at the same moment, the second read the alert as still active before
    the first had written, and the groups and the contacts were told twice that the rider is fine (4 times out of 5
    against the running stack). The other request is simulated: it resolves the alert just before this one writes."""
    import sqlalchemy as sa

    from app.api import sos as sos_api
    from app.messaging.models import Notification

    friend_id = _group_with(app, rider, user_factory, 'friend6@example.com', 'friend_six')
    _login(client, 'rider@example.com')
    alert = client.post('/api/sos', json={}).get_json()['alert']
    real_utcnow = sos_api._utcnow

    def resolved_by_the_other_request():
        monkeypatch.setattr(sos_api, '_utcnow', real_utcnow)
        db.session.execute(sa.update(SOSAlert).where(SOSAlert.id == alert['id'])
                           .values(status='resolved', resolved_at=real_utcnow()))
        return real_utcnow()

    monkeypatch.setattr(sos_api, '_utcnow', resolved_by_the_other_request)
    response = client.post(f"/api/sos/{alert['id']}/resolve")
    assert response.status_code == 200 and response.get_json()['alert']['status'] == 'resolved'

    with app.app_context():
        titles = [n.title for n in Notification.query.filter_by(user_id=friend_id, category='sicurezza')]
        assert titles == ['🚨 SOS from Mario Rossi']  # "is OK" is sent by the request that resolved it, not by this one
    assert [m['Subject'] for s in smtp.instances for m in s.messages] == ['SOS da Mario Rossi']


def test_a_failing_group_notification_does_not_stop_the_emails(app, client, rider, smtp, monkeypatch,
                                                               user_factory):
    from app.api import sos as sos_api

    _group_with(app, rider, user_factory, 'friend5@example.com', 'friend_five')

    def broken(*args, **kwargs):
        raise RuntimeError('database hiccup')

    monkeypatch.setattr(sos_api, 'notify_text', broken)
    _login(client, 'rider@example.com')
    response = client.post('/api/sos', json={})
    assert response.status_code == 201
    assert response.get_json()['notifications']['emails_sent'] == 1
