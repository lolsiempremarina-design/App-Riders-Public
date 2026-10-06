"""Email confirmation with a 6-digit code when the email service is on (app/auth/email_confirmation.py)."""
import re
from datetime import timedelta

import pytest
from test_api_auth import VALID_REGISTRATION
from test_api_sos import FakeSMTP

from app import notifications
from app.auth import email_confirmation
from app.auth.models import EmailCode, User
from extensions import db


@pytest.fixture
def mail(app, monkeypatch):
    FakeSMTP.instances = []
    monkeypatch.setattr(notifications.smtplib, 'SMTP', FakeSMTP)
    app.config.update(MAIL_SERVER='smtp.example.com', MAIL_PORT=587, MAIL_USE_TLS=True,
                      MAIL_USERNAME='ror@example.com', MAIL_PASSWORD='x', MAIL_FROM='ror@example.com')
    return FakeSMTP


def _last_mail():
    message = FakeSMTP.instances[-1].messages[-1]
    return message['To'], message['Subject'], re.search(r'\b(\d{6})\b', message.get_content()).group(1)


def _wrong(code):
    return f'{(int(code) + 1) % 10**6:06d}'


def _later(monkeypatch, **delta):
    """The clock of the confirmation module moved forward (resend pause, expiry)."""
    base = email_confirmation.utcnow()
    monkeypatch.setattr(email_confirmation, 'utcnow', lambda: base + timedelta(**delta))


def test_without_the_email_service_nothing_changes(client):
    response = client.post('/api/auth/register', json=VALID_REGISTRATION)
    assert response.status_code == 201 and response.get_json()['user']['email_confirmed'] is True
    assert client.get('/api/groups').status_code == 200


def test_a_new_account_works_only_after_typing_the_code(app, client, mail):
    """Before, anybody could register with somebody else's email and that person could no longer use it."""
    response = client.post('/api/auth/register', json=VALID_REGISTRATION, headers={'Accept-Language': 'it'})
    assert response.status_code == 201
    assert response.get_json()['user']['email_confirmed'] is False
    to, subject, code = _last_mail()
    assert to == 'mario.rossi@example.com' and subject == f'Il tuo codice RoR: {code}'  # language of the account

    blocked = client.get('/api/groups', headers={'Accept-Language': 'it'})
    assert blocked.status_code == 403 and blocked.get_json()['error'] == 'email_not_confirmed'
    assert blocked.get_json()['message'].startswith('Prima conferma il tuo indirizzo email')
    assert client.get('/auth/check_session').status_code == 401  # no GPS session either
    assert client.get('/api/auth/me').status_code == 200        # what the confirmation page needs
    assert client.patch('/api/settings', json={'language': 'es'}).status_code == 200
    state = client.get('/api/auth/confirm-email').get_json()
    assert state == {'confirmed': False, 'email': 'mario.rossi@example.com', 'resend_in_sec': 60, 'mail_configured': True}

    wrong = client.post('/api/auth/confirm-email', json={'code': _wrong(code)})
    assert wrong.status_code == 422 and wrong.get_json()['fields'] == {'code': 'The code is not correct.'}
    assert client.post('/api/auth/confirm-email', json={'code': 'abc'}).status_code == 422
    done = client.post('/api/auth/confirm-email', json={'code': code})
    assert done.status_code == 200 and done.get_json()['user']['email_confirmed'] is True
    assert client.get('/api/groups').status_code == 200
    assert client.post('/api/auth/confirm-email', json={'code': code}).get_json()['error'] == 'nothing_to_confirm'


def test_codes_expire_after_five_wrong_attempts_or_a_day(client, mail, monkeypatch):
    client.post('/api/auth/register', json=VALID_REGISTRATION)
    _to, _subject, code = _last_mail()
    for _ in range(5):
        response = client.post('/api/auth/confirm-email', json={'code': _wrong(code)})
    assert 'expired' in response.get_json()['fields']['code']
    assert 'expired' in client.post('/api/auth/confirm-email', json={'code': code}).get_json()['fields']['code']

    # a new code only after a minute
    too_soon = client.post('/api/auth/confirm-email/resend', json={})
    assert too_soon.status_code == 429 and too_soon.get_json()['error'] == 'code_wait'
    _later(monkeypatch, seconds=61)
    assert client.post('/api/auth/confirm-email/resend', json={}).status_code == 200
    _to, _subject, new_code = _last_mail()
    _later(monkeypatch, hours=25)
    assert 'expired' in client.post('/api/auth/confirm-email', json={'code': new_code}).get_json()['fields']['code']


def test_a_mistyped_address_is_corrected_from_the_confirmation_page(app, client, mail, user_factory):
    with app.app_context():
        user_factory('taken@example.com', 'someone_else')
        db.session.commit()
    client.post('/api/auth/register', json={**VALID_REGISTRATION, 'email': 'mario.rosi@example.com'})
    taken = client.post('/api/auth/confirm-email/resend', json={'email': 'taken@example.com'})
    assert taken.status_code == 422 and 'email' in taken.get_json()['fields']

    with app.app_context():  # the minute between two codes has passed
        row = db.session.get(EmailCode, User.query.filter_by(username='mario_rossi').one().id)
        row.sent_at -= timedelta(minutes=2)
        db.session.commit()
    assert client.post('/api/auth/confirm-email/resend', json={'email': 'mario.rossi@example.com'}).status_code == 200
    to, _subject, code = _last_mail()
    assert to == 'mario.rossi@example.com'
    assert client.post('/api/auth/confirm-email', json={'code': code}).status_code == 200
    assert client.get('/api/auth/me').get_json()['email'] == 'mario.rossi@example.com'


def test_a_new_address_from_the_profile_is_used_only_once_confirmed(app, client, mail, user_factory):
    with app.app_context():
        user_factory('anna@example.com', 'anna')
        db.session.commit()
    assert client.post('/api/auth/login', json={'identity': 'anna@example.com', 'password': 'password'}).status_code == 200

    response = client.patch('/api/profile', json={'email': 'anna.nuova@example.com'})
    body = response.get_json()
    assert body['email_confirmation_sent'] is True
    assert body['user']['email'] == 'anna@example.com' and body['user']['pending_email'] == 'anna.nuova@example.com'
    assert client.get('/api/groups').status_code == 200  # the account keeps working meanwhile
    to, _subject, code = _last_mail()
    assert to == 'anna.nuova@example.com'

    assert client.post('/api/auth/confirm-email', json={'code': code}).get_json()['user']['email'] == 'anna.nuova@example.com'
    assert client.post('/api/auth/login', json={'identity': 'anna.nuova@example.com', 'password': 'password'}).status_code == 200

    # a change can also be cancelled: the address stays the same
    client.patch('/api/profile', json={'email': 'anna.terza@example.com'})
    cancelled = client.delete('/api/auth/confirm-email').get_json()
    assert cancelled['user']['email'] == 'anna.nuova@example.com' and cancelled['user']['pending_email'] is None


def test_accounts_never_confirmed_are_deleted_after_48_hours(app, client, mail):
    """Their email and tax code can then be used by who really owns them."""
    client.post('/api/auth/register', json=VALID_REGISTRATION)
    with app.app_context():
        user = User.query.filter_by(username='mario_rossi').one()
        assert app.test_cli_runner().invoke(args=['ror', 'purge-expired']).exit_code == 0
        assert db.session.get(User, user.id) is not None  # still in time
        user.created_at -= timedelta(hours=49)
        db.session.commit()
        # the database, not the printed text: without Redis (CI) the deletion logs an error and pytest's live
        # logging (log_cli) takes the output of the command away from the CLI runner
        assert app.test_cli_runner().invoke(args=['ror', 'purge-expired']).exit_code == 0
        assert User.query.filter_by(username='mario_rossi').first() is None

    client.post('/api/auth/logout')
    assert client.post('/api/auth/register', json=VALID_REGISTRATION).status_code == 201


def test_an_admin_can_confirm_an_account_by_hand(app, client, mail):
    client.post('/api/auth/register', json=VALID_REGISTRATION)
    result = app.test_cli_runner().invoke(args=['ror', 'confirm-email', 'mario.rossi@example.com'])
    assert result.exit_code == 0 and 'confirmed' in result.output
    assert client.get('/api/groups').status_code == 200
