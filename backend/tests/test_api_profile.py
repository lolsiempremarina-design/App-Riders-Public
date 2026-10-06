"""Profile, password, SOS contacts and settings API (phase 2)."""
from datetime import datetime, timezone

import pytest

from app.auth.models import RiderShift, SOSContact, User
from extensions import db

PNG_1PX = (
    'data:image/png;base64,'
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII='
)


def _login(app, client, user_factory, email='me@example.com', username='me_user', **extra):
    with app.app_context():
        user = user_factory(email, username, **extra)
        db.session.commit()
        user_id = user.id
    response = client.post('/api/auth/login', json={'identity': email, 'password': 'password'})
    assert response.status_code == 200
    return user_id


def test_profile_requires_login(client):
    assert client.get('/api/profile').status_code == 401
    assert client.get('/api/sos-contacts').status_code == 401
    assert client.patch('/api/settings', json={'language': 'it'}).status_code == 401


def test_profile_returns_user_and_real_stats(app, client, user_factory):
    user_id = _login(app, client, user_factory)
    with app.app_context():
        db.session.add_all([
            RiderShift(session_id='s1', user_id=user_id, gpx_path='/tmp/a.gpx', total_distance_km=12.5, duration_min=40,
                       created_at=datetime(2026, 9, 1, tzinfo=timezone.utc)),
            RiderShift(session_id='s2', user_id=user_id, gpx_path='/tmp/b.gpx', total_distance_km=7.5, duration_min=20),
        ])
        db.session.commit()

    body = client.get('/api/profile').get_json()
    assert body['user']['email'] == 'me@example.com'
    assert body['stats'] == {'rides_count': 2, 'total_distance_km': 20.0, 'total_duration_min': 60.0}


def test_update_profile_contact_details_and_photo(app, client, user_factory):
    _login(app, client, user_factory)
    with app.app_context():
        user_factory('other@example.com', 'other_user', phone_number='+39 111 2222222')
        db.session.commit()

    taken = client.patch('/api/profile', json={'email': 'OTHER@example.com', 'phone_number': '+39 111 2222222'})
    assert taken.status_code == 422
    assert {'email', 'phone_number'} <= set(taken.get_json()['fields'])

    ok = client.patch('/api/profile', json={
        'username': 'new_name',
        'email': 'New@Example.com',
        'phone_number': '+39 333 0000000',
        'avatar': PNG_1PX,
    })
    assert ok.status_code == 200, ok.get_json()
    user = ok.get_json()['user']
    assert user['username'] == 'new_name'
    assert user['email'] == 'new@example.com'
    assert user['avatar'].startswith('data:image/png')

    removed = client.patch('/api/profile', json={'avatar': None})
    assert removed.get_json()['user']['avatar'] is None


def test_identity_fields_cannot_be_changed(app, client, user_factory):
    _login(app, client, user_factory)
    client.patch('/api/profile', json={'first_name': 'Hacker', 'tax_id_code': 'XXXXXXXXXXXXXXXX', 'roles': ['admin']})
    with app.app_context():
        user = User.query.filter_by(email='me@example.com').one()
        assert user.first_name != 'Hacker'
        assert user.tax_id_code != 'XXXXXXXXXXXXXXXX'
        assert not user.has_role('admin')


def test_change_password(app, client, user_factory):
    _login(app, client, user_factory)

    wrong = client.post('/api/profile/password', json={
        'current_password': 'nope', 'new_password': 'Nuova-Password-1', 'new_password_confirm': 'Nuova-Password-1',
    })
    assert wrong.status_code == 422
    assert 'current_password' in wrong.get_json()['fields']

    ok = client.post('/api/profile/password', json={
        'current_password': 'password', 'new_password': 'Nuova-Password-1', 'new_password_confirm': 'Nuova-Password-1',
    })
    assert ok.status_code == 200
    # The current session stays valid after the change.
    assert client.get('/api/auth/me').status_code == 200

    client.post('/api/auth/logout')
    assert client.post('/api/auth/login', json={'identity': 'me@example.com', 'password': 'password'}).status_code == 401
    assert client.post('/api/auth/login', json={'identity': 'me@example.com', 'password': 'Nuova-Password-1'}).status_code == 200


def test_sos_contacts_crud_and_limit(app, client, user_factory):
    _login(app, client, user_factory)

    created = client.post('/api/sos-contacts', json={
        'name': 'Maria Rossi', 'phone': '+39 333 1234567', 'relationship': 'Madre', 'email': 'maria@example.com', 'priority': 2,
    })
    assert created.status_code == 201
    contact_id = created.get_json()['id']

    invalid = client.post('/api/sos-contacts', json={'name': 'X', 'phone': 'abc'})
    assert invalid.status_code == 422
    assert {'name', 'phone'} <= set(invalid.get_json()['fields'])

    updated = client.patch(f'/api/sos-contacts/{contact_id}', json={'phone': '+39 333 7654321'})
    assert updated.get_json()['phone'] == '+39 333 7654321'
    assert updated.get_json()['name'] == 'Maria Rossi'

    for index in range(4):
        assert client.post('/api/sos-contacts', json={'name': f'Contatto {index}', 'phone': f'+39 300 00000{index}'}).status_code == 201
    limit = client.post('/api/sos-contacts', json={'name': 'Sesto', 'phone': '+39 300 9999999'})
    assert limit.status_code == 409
    assert limit.get_json()['error'] == 'limit_reached'

    listing = client.get('/api/sos-contacts').get_json()
    assert len(listing['contacts']) == 5
    assert listing['contacts'][0]['id'] == contact_id  # highest priority first

    assert client.delete(f'/api/sos-contacts/{contact_id}').status_code == 200
    assert client.delete(f'/api/sos-contacts/{contact_id}').status_code == 404


def test_sos_contacts_are_private(app, client, user_factory):
    with app.app_context():
        owner = user_factory('owner@example.com', 'owner_user')
        db.session.commit()
        contact = SOSContact(user_id=owner.id, name='Private', phone='+39 1234567')
        db.session.add(contact)
        db.session.commit()
        contact_id = contact.id

    _login(app, client, user_factory)
    assert client.get('/api/sos-contacts').get_json()['contacts'] == []
    assert client.patch(f'/api/sos-contacts/{contact_id}', json={'name': 'Hacked'}).status_code == 404
    assert client.delete(f'/api/sos-contacts/{contact_id}').status_code == 404


def test_settings_roundtrip(app, client, user_factory):
    _login(app, client, user_factory)
    assert client.get('/api/settings').get_json() == {
        'language': 'en', 'sensors_enabled': False, 'share_location_with_groups': False,
    }

    response = client.patch('/api/settings', json={'language': 'fr', 'sensors_enabled': True, 'share_location_with_groups': True})
    assert response.status_code == 200
    assert response.get_json() == {'language': 'fr', 'sensors_enabled': True, 'share_location_with_groups': True}

    bad = client.patch('/api/settings', json={'language': 'french', 'sensors_enabled': 'yes'})
    assert bad.status_code == 422
    assert client.get('/api/settings').get_json()['language'] == 'fr'


@pytest.mark.parametrize('phone, ok', [
    ('1', False),                    # before: accepted as the phone of an SOS contact
    ('+39 1234', False),             # 6 digits
    ('333 1234567', True),
    ('+39 333 1234567', True),
    ('+54 9 11 1234 5678', True),    # 13 digits
    ('+123 4567 8901 23456', False),  # 16 digits: longer than any international number
])
def test_phone_numbers_follow_the_rule_of_the_app(app, client, user_factory, phone, ok):
    """8 to 15 digits, like isValidPhoneNumber in the app (src/utils/authUtils.js)."""
    _login(app, client, user_factory)
    response = client.post('/api/sos-contacts', json={'name': 'Anna', 'phone': phone})
    assert (response.status_code == 201) is ok, response.get_json()
    if not ok:
        assert response.get_json()['fields']['phone'] == 'The phone number must have between 8 and 15 digits.'
