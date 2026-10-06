"""JSON authentication API used by the React frontend."""
import pytest

from app.auth.models import SOSContact, User
from extensions import db

VALID_REGISTRATION = {
    'username': 'mario_rossi',
    'email': 'Mario.Rossi@Example.com',
    'password': 'SuperSegreta1!',
    'password_confirm': 'SuperSegreta1!',
    'first_name': 'Mario',
    'last_name': 'Rossi',
    'date_of_birth': '1985-08-01',
    'gender': 'M',
    'birth_city_country': 'Roma',
    'tax_id_code': 'RSSMRA85M01H501Q',
    'phone_number': '+39 348 1234567',
    'language': 'it',
    'sos_contact': {'name': 'Maria Rossi', 'phone': '+39 333 9876543', 'email': 'maria@example.com'},
}


def _register(client, **overrides):
    payload = {**VALID_REGISTRATION, **overrides}
    return client.post('/api/auth/register', json=payload)


def test_csrf_and_anonymous_session(client):
    response = client.get('/api/auth/csrf')
    assert response.status_code == 200
    assert response.get_json()['csrf_token']

    session = client.get('/api/auth/session').get_json()
    assert session['authenticated'] is False
    assert session['user'] is None
    assert session['csrf_token']


def test_api_responses_are_not_cacheable(client):
    response = client.get('/api/auth/session')
    assert response.headers['Cache-Control'] == 'no-store'


def test_me_requires_authentication_with_json_401(client):
    response = client.get('/api/auth/me')
    assert response.status_code == 401
    assert response.get_json()['error'] == 'unauthorized'


def test_unknown_api_route_returns_json_404(client):
    response = client.get('/api/does-not-exist')
    assert response.status_code == 404
    assert response.get_json()['error'] == 'not_found'


def test_login_with_email_or_username_and_logout(app, client, user_factory):
    with app.app_context():
        user_factory('rider@example.com', 'rider_one')
        db.session.commit()

    bad = client.post('/api/auth/login', json={'identity': 'rider@example.com', 'password': 'wrong'})
    assert bad.status_code == 401
    assert bad.get_json()['error'] == 'invalid_credentials'

    ok = client.post('/api/auth/login', json={'identity': 'RIDER@example.com', 'password': 'password'})
    assert ok.status_code == 200
    body = ok.get_json()
    assert body['authenticated'] is True
    assert body['user']['username'] == 'rider_one'
    assert 'password' not in body['user']

    assert client.get('/api/auth/me').get_json()['email'] == 'rider@example.com'
    # The existing Flask session (used by FastAPI) is shared with the SPA.
    assert client.get('/auth/check_session').status_code == 200

    assert client.post('/api/auth/logout').get_json()['authenticated'] is False
    assert client.get('/api/auth/me').status_code == 401

    by_username = client.post('/api/auth/login', json={'identity': 'rider_one', 'password': 'password'})
    assert by_username.status_code == 200


def test_login_rejects_disabled_accounts(app, client, user_factory):
    with app.app_context():
        user_factory('off@example.com', 'off_user', active=False)
        db.session.commit()
    response = client.post('/api/auth/login', json={'identity': 'off@example.com', 'password': 'password'})
    assert response.status_code == 403


def test_register_creates_user_sos_contact_and_session(app, client):
    response = _register(client)
    assert response.status_code == 201, response.get_json()
    body = response.get_json()
    assert body['authenticated'] is True
    assert body['user']['first_name'] == 'Mario'
    assert body['user']['email'] == 'mario.rossi@example.com'
    assert body['user']['language'] == 'it'

    with app.app_context():
        user = User.query.filter_by(username='mario_rossi').one()
        assert user.full_name == 'Mario Rossi'
        assert user.phone_number == '+39 348 1234567'
        contact = SOSContact.query.filter_by(user_id=user.id).one()
        assert contact.email == 'maria@example.com'
        assert contact.priority == 1

    assert client.get('/api/auth/me').status_code == 200


def test_register_validation_errors_are_reported_per_field(client):
    response = _register(
        client,
        username='x',
        password='short',
        password_confirm='short',
        tax_id_code='RSSMRA85M01H501Z',
        gender='X',
    )
    assert response.status_code == 422
    fields = response.get_json()['fields']
    assert {'username', 'password', 'gender'} <= set(fields)

    wrong_tax = _register(client, tax_id_code='RSSMRA85M01H501Z')
    assert wrong_tax.status_code == 422
    assert 'tax_id_code' in wrong_tax.get_json()['fields']

    mismatch = _register(client, password_confirm='Different123!')
    assert 'password_confirm' in mismatch.get_json()['fields']


def test_register_rejects_duplicates_case_insensitively(client):
    assert _register(client).status_code == 201
    client.post('/api/auth/logout')

    duplicate = _register(client, username='MARIO_ROSSI', email='mario.rossi@EXAMPLE.com')
    assert duplicate.status_code == 422
    fields = duplicate.get_json()['fields']
    assert {'username', 'email', 'tax_id_code', 'phone_number'} <= set(fields)


@pytest.mark.parametrize('email', [
    ['mario.rossi@example.com'], {'a': 'mario.rossi@example.com'}, 12345, 'mario@example.com,altro', 'mario rossi@example.com',
    '"mario"@example.com', 'mario@[127.0.0.1]', 'mario@example', 'mario@-example.com', 'mario@exam\nple.com',
])
def test_register_refuses_addresses_that_are_not_plain_emails(client, email):
    """These addresses then receive the SOS emails and the codes: a list became the text "['...']" and was
    accepted, as were commas, quotes and brackets."""
    response = _register(client, email=email)
    assert response.status_code == 422 and 'email' in response.get_json()['fields']
    sos = _register(client, sos_contact={**VALID_REGISTRATION['sos_contact'], 'email': email})
    assert sos.status_code == 422 and 'sos_contact.email' in sos.get_json()['fields']


def test_lists_and_objects_are_not_text(app, client):
    """Before, ["Mario"] was saved as the name "['Mario']"."""
    response = _register(client, first_name=['Mario'], birth_city_country={'city': 'Roma'})
    assert response.status_code == 422 and {'first_name', 'birth_city_country'} <= set(response.get_json()['fields'])
    with app.app_context():
        assert User.query.count() == 0


@pytest.mark.parametrize('email', ["mario.o'neil+ror@example.co.uk", 'MARIO_ROSSI-1@sub.example.it', 'a@b.cd'])
def test_register_accepts_usual_addresses(client, email):
    assert _register(client, email=email).status_code == 201


def test_register_rejects_invalid_avatar(client):
    response = _register(client, avatar='https://example.com/photo.png')
    assert response.status_code == 422
    assert 'avatar' in response.get_json()['fields']


def test_csrf_is_enforced_on_api_posts_when_enabled(app, client):
    app.config['WTF_CSRF_ENABLED'] = True
    try:
        rejected = client.post('/api/auth/login', json={'identity': 'a@b.it', 'password': 'x'})
        assert rejected.status_code == 400
        assert rejected.get_json()['error'] == 'csrf_error'

        token = client.get('/api/auth/csrf').get_json()['csrf_token']
        accepted = client.post(
            '/api/auth/login',
            json={'identity': 'a@b.it', 'password': 'x'},
            headers={'X-CSRFToken': token},
        )
        assert accepted.status_code == 401  # CSRF passed, credentials rejected
    finally:
        app.config['WTF_CSRF_ENABLED'] = False


def test_delete_account_requires_password(app, client, user_factory):
    with app.app_context():
        user_factory('bye@example.com', 'bye_user')
        db.session.commit()
    client.post('/api/auth/login', json={'identity': 'bye@example.com', 'password': 'password'})

    wrong = client.post('/api/auth/delete-account', json={'password': 'nope'})
    assert wrong.status_code == 403
    assert wrong.get_json()['error'] == 'invalid_password'

    ok = client.post('/api/auth/delete-account', json={'password': 'password'})
    assert ok.status_code == 200
    assert ok.get_json()['success'] is True
    assert client.get('/api/auth/me').status_code == 401
    with app.app_context():
        assert User.query.filter_by(email='bye@example.com').first() is None


def test_passwords_that_are_not_text_are_refused_without_server_errors(app, client, user_factory):
    """A password sent as a number, list or object (modified client) is a wrong password, not a 500."""
    with app.app_context():
        user_factory('types@example.com', 'types_user')
        db.session.commit()
    for bad in (12345678, ['password'], {'p': 1}, True):
        assert client.post('/api/auth/login', json={'identity': 'types@example.com', 'password': bad}).status_code == 400

    assert client.post('/api/auth/login', json={'identity': 'types@example.com', 'password': 'password'}).status_code == 200
    changed = client.post('/api/profile/password', json={
        'current_password': 12345678, 'new_password': 'abcdefgh12', 'new_password_confirm': 'abcdefgh12'})
    assert changed.status_code == 422 and 'current_password' in changed.get_json()['fields']
    assert client.post('/api/auth/delete-account', json={'password': 12345678}).status_code == 403
    assert client.get('/api/auth/me').status_code == 200  # still there


def test_register_rider_born_abroad(client):
    """Foreign-born riders have a tax code with the country code (Z...) instead of an Italian municipality."""
    response = _register(
        client, username='juan_perez', email='juan@example.com', first_name='Juan', last_name='Perez',
        date_of_birth='1995-06-20', birth_city_country='Argentina', tax_id_code='PRZJNU95H20Z600X',
        phone_number='+54 9 11 12345678',
    )
    assert response.status_code == 201, response.get_json()
    assert response.get_json()['user']['birth_city_country'] == 'Argentina'


def test_register_only_adults(client, monkeypatch):
    """Riders work on the road: at least 18 years old (before, a birth date of yesterday was accepted)."""
    from datetime import date

    from app.auth.tax_id import MONTH_CODES, _check_character, _name_code

    def tax_code(born):
        start = (f"{_name_code('Rossi')}{_name_code('Mario', given_name=True)}"
                 f"{born.year % 100:02d}{MONTH_CODES[born.month - 1]}{born.day:02d}H501")
        return start + _check_character(start)

    monkeypatch.setattr('app.api.auth.local_today', lambda: date(2026, 10, 2))
    for born in (date(2008, 10, 3), date(2026, 10, 1)):  # 18 tomorrow, born yesterday
        response = _register(client, date_of_birth=born.isoformat(), tax_id_code=tax_code(born))
        assert response.status_code == 422
        assert set(response.get_json()['fields']) == {'date_of_birth'}
        assert '18' in response.get_json()['fields']['date_of_birth']

    adult = date(2008, 10, 2)  # 18 today
    response = _register(client, date_of_birth=adult.isoformat(), tax_id_code=tax_code(adult))
    assert response.status_code == 201, response.get_json()


def test_age_counts_completed_years_also_for_29_february():
    from datetime import date

    from app.api.auth import age_on

    assert age_on(date(2008, 2, 29), date(2026, 2, 28)) == 17
    assert age_on(date(2008, 2, 29), date(2026, 3, 1)) == 18
    assert age_on(date(2008, 2, 28), date(2028, 2, 29)) == 20
    assert age_on(date(2010, 3, 1), date(2028, 2, 29)) == 17


def test_register_rider_born_in_a_suppressed_municipality(client):
    """The ISTAT list has only today's municipalities: whoever was born in one that was suppressed or merged
    types the tax code by hand, and the server must not reject it because its cadastral code is not listed."""
    from app.api.municipalities import load_municipalities

    tax_id_code = 'RSSMRA50C10F778W'  # example cadastral code F778, not in today's list
    assert tax_id_code[11:15] not in {row[2] for row in load_municipalities()['municipalities']}
    response = _register(client, date_of_birth='1950-03-10', birth_city_country='Mosso (BI)', tax_id_code=tax_id_code)
    assert response.status_code == 201, response.get_json()
    assert response.get_json()['user']['birth_city_country'] == 'Mosso (BI)'


def test_passwords_with_a_nul_character_are_refused_without_server_errors(app, client, user_factory):
    """bcrypt refuses NUL: it was a 500 at registration, login, password change and account deletion."""
    response = _register(client, password='Pass\x00word1', password_confirm='Pass\x00word1')
    assert response.status_code == 422 and 'password' in response.get_json()['fields']

    with app.app_context():
        user_factory('nul@example.com', 'nul_user')
        db.session.commit()
    assert client.post('/api/auth/login', json={'identity': 'nul@example.com', 'password': 'pass\x00word'}).status_code == 400
    assert client.post('/api/auth/login', json={'identity': 'nul@example.com', 'password': 'password'}).status_code == 200
    changed = client.post('/api/profile/password', json={
        'current_password': 'password', 'new_password': 'new\x00password', 'new_password_confirm': 'new\x00password'})
    assert changed.status_code == 422 and 'new_password' in changed.get_json()['fields']
    assert client.post('/api/auth/delete-account', json={'password': 'pass\x00word'}).status_code == 403


def test_names_and_birth_place_must_be_on_one_line(client):
    for field in ('first_name', 'last_name', 'birth_city_country'):
        value = {'first_name': 'Ma\nrio', 'last_name': 'Ros\tsi', 'birth_city_country': 'Ro\nma'}[field]
        response = _register(client, **{field: value})
        assert response.status_code == 422 and field in response.get_json()['fields'], field
