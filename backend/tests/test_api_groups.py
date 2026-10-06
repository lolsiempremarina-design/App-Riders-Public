"""Groups API (phase 3): membership, invites, roles and live positions."""
import json

import pytest

from app.api import groups as groups_module
from app.auth.models import Group, GroupMembership, User
from extensions import db


class FakeRedis:
    def __init__(self):
        self.data = {}
        self.ttl = {}

    def set(self, key, value, ex=None):
        self.data[key] = value
        self.ttl[key] = ex

    def mget(self, keys):
        return [self.data.get(k) for k in keys]

    def delete(self, *keys):
        for key in keys:
            self.data.pop(key, None)


@pytest.fixture
def fake_redis(monkeypatch):
    fake = FakeRedis()
    monkeypatch.setattr(groups_module, 'redis_client', fake)
    return fake


@pytest.fixture
def users(app, user_factory):
    with app.app_context():
        created = {
            name: user_factory(f'{name}@example.com', name)
            for name in ('owner_user', 'second_user', 'third_user')
        }
        db.session.commit()
        return {name: user.id for name, user in created.items()}


def _login(client, username):
    client.post('/api/auth/logout')
    response = client.post('/api/auth/login', json={'identity': f'{username}@example.com', 'password': 'password'})
    assert response.status_code == 200


def _create(client, name='Rider Navigli', description='Turno serale'):
    response = client.post('/api/groups', json={'name': name, 'description': description})
    assert response.status_code == 201
    return response.get_json()


def test_groups_require_login(client):
    assert client.get('/api/groups').status_code == 401
    assert client.post('/api/groups', json={'name': 'x'}).status_code == 401


def test_create_and_list(users, client, fake_redis):
    _login(client, 'owner_user')
    assert client.get('/api/groups').get_json() == {'groups': []}

    group = _create(client)
    assert group['my_role'] == 'owner'
    assert group['member_count'] == 1
    assert group['can_manage'] is True
    assert group['invite_token']
    assert len(group['code']) == 12
    assert group['members'][0]['is_me'] is True

    listed = client.get('/api/groups').get_json()['groups']
    assert [g['name'] for g in listed] == ['Rider Navigli']
    assert 'members' not in listed[0]

    invalid = client.post('/api/groups', json={'name': 'x', 'description': 'y' * 300})
    assert invalid.status_code == 422
    assert set(invalid.get_json()['fields']) == {'name', 'description'}


def test_join_by_code_and_token(users, client, fake_redis):
    _login(client, 'owner_user')
    group = _create(client)

    _login(client, 'second_user')
    assert client.get(f"/api/groups/{group['id']}").status_code == 404  # not a member yet
    joined = client.post('/api/groups/join', json={'code': group['code'].upper().replace('-', '')})
    assert joined.status_code == 201
    assert joined.get_json()['group']['my_role'] == 'member'
    assert joined.get_json()['group']['invite_token'] is None  # members do not see the token
    again = client.post('/api/groups/join', json={'code': group['code']})
    assert again.status_code == 200 and again.get_json()['already_member'] is True

    _login(client, 'third_user')
    assert client.post('/api/groups/join', json={'code': 'zzz-zzzz-zzz'}).status_code == 422
    assert client.post('/api/groups/join', json={'token': 'nope'}).get_json()['error'] == 'invalid_invite'
    assert client.post('/api/groups/join', json={'token': group['invite_token']}).status_code == 201
    assert client.get(f"/api/groups/{group['id']}").get_json()['member_count'] == 3


def test_manage_invites_codes_and_roles(users, client, fake_redis):
    _login(client, 'owner_user')
    group = _create(client)
    _login(client, 'second_user')
    client.post('/api/groups/join', json={'code': group['code']})
    assert client.post(f"/api/groups/{group['id']}/code").status_code == 403
    assert client.patch(f"/api/groups/{group['id']}/members/{users['owner_user']}", json={'role': 'member'}).status_code == 403

    _login(client, 'owner_user')
    revoked = client.delete(f"/api/groups/{group['id']}/invite").get_json()
    assert revoked['invite_token'] is None
    renewed = client.post(f"/api/groups/{group['id']}/invite").get_json()
    assert renewed['invite_token'] and renewed['invite_token'] != group['invite_token']
    new_code = client.post(f"/api/groups/{group['id']}/code").get_json()['code']
    assert new_code != group['code']

    promoted = client.patch(f"/api/groups/{group['id']}/members/{users['second_user']}", json={'role': 'admin'})
    assert promoted.get_json()['role'] == 'admin'
    assert client.patch(f"/api/groups/{group['id']}/members/{users['second_user']}", json={'role': 'owner'}).status_code == 422
    assert client.patch(f"/api/groups/{group['id']}/members/{users['owner_user']}", json={'role': 'admin'}).status_code == 400

    renamed = client.patch(f"/api/groups/{group['id']}", json={'name': 'Navigli Night'})
    assert renamed.get_json()['name'] == 'Navigli Night'


def test_leave_transfers_ownership_and_last_member_deletes(app, users, client, fake_redis):
    _login(client, 'owner_user')
    group = _create(client)
    for name in ('second_user', 'third_user'):
        _login(client, name)
        client.post('/api/groups/join', json={'code': group['code']})

    # An admin cannot remove another admin, but can remove members.
    _login(client, 'owner_user')
    client.patch(f"/api/groups/{group['id']}/members/{users['third_user']}", json={'role': 'admin'})
    left = client.delete(f"/api/groups/{group['id']}/members/{users['owner_user']}")
    assert left.get_json() == {'success': True, 'group_deleted': False}
    with app.app_context():
        roles = {m.user_id: m.role for m in GroupMembership.query.filter_by(group_id=group['id'])}
    assert roles == {users['second_user']: 'member', users['third_user']: 'owner'}

    _login(client, 'third_user')
    assert client.delete(f"/api/groups/{group['id']}/members/{users['second_user']}").status_code == 200
    assert client.delete(f"/api/groups/{group['id']}/members/{users['third_user']}").get_json()['group_deleted'] is True
    with app.app_context():
        assert db.session.get(Group, group['id']) is None


def test_account_deletion_hands_over_or_deletes_groups(app, users, client, fake_redis):
    _login(client, 'owner_user')
    shared = _create(client, name='Condiviso')
    alone = _create(client, name='Solo io')
    _login(client, 'second_user')
    client.post('/api/groups/join', json={'code': shared['code']})

    _login(client, 'owner_user')
    assert client.post('/api/auth/delete-account', json={'password': 'password'}).status_code == 200
    with app.app_context():
        # the group with other members keeps an owner; the empty one is gone (its code no longer works)
        roles = {m.user_id: m.role for m in GroupMembership.query.filter_by(group_id=shared['id'])}
        assert roles == {users['second_user']: 'owner'}
        assert db.session.get(Group, alone['id']) is None
    _login(client, 'third_user')
    joined = client.post('/api/groups/join', json={'code': alone['code']})
    assert joined.status_code == 422 and 'code' in joined.get_json()['fields']


def test_live_positions_respect_privacy(app, users, client, fake_redis):
    _login(client, 'owner_user')
    group = _create(client)
    _login(client, 'second_user')
    client.post('/api/groups/join', json={'code': group['code']})

    denied = client.post('/api/groups/position', json={'lat': 45.46, 'lon': 9.19})
    assert denied.status_code == 403 and denied.get_json()['error'] == 'location_sharing_disabled'

    client.patch('/api/settings', json={'sensors_enabled': True, 'share_location_with_groups': True})
    assert client.post('/api/groups/position', json={'lat': 'x', 'lon': 9}).status_code == 422
    assert client.post('/api/groups/position', json={'lat': 95, 'lon': 9}).status_code == 422
    assert client.post('/api/groups/position', json={'lat': 45.46, 'lon': 9.19}).get_json()['success'] is True
    assert json.loads(fake_redis.data[f"group_position:{users['second_user']}"])['lat'] == 45.46

    _login(client, 'owner_user')
    positions = client.get(f"/api/groups/{group['id']}/positions").get_json()['positions']
    assert [(p['username'], p['lat'], p['lon']) for p in positions] == [('second_user', 45.46, 9.19)]
    detail = client.get(f"/api/groups/{group['id']}").get_json()
    assert detail['sharing_count'] == 1

    # Turning sharing off hides the position immediately, even if Redis still has it.
    with app.app_context():
        user = db.session.get(User, users['second_user'])
        user.share_location_with_groups = False
        db.session.commit()
    assert client.get(f"/api/groups/{group['id']}/positions").get_json()['positions'] == []

    _login(client, 'third_user')
    assert client.get(f"/api/groups/{group['id']}/positions").status_code == 404


def test_the_map_gets_all_groups_with_one_request_and_one_redis_call(app, users, client, fake_redis, monkeypatch):
    """Before, the map asked the list of groups plus one request per group every 20 seconds, and the server
    read Redis twice for every member."""
    _login(client, 'owner_user')
    first, second = _create(client), _create(client, name='Rider Isola')
    for username in ('second_user', 'third_user'):
        _login(client, username)
        client.patch('/api/settings', json={'sensors_enabled': True, 'share_location_with_groups': True})
        for group in (first, second):
            client.post('/api/groups/join', json={'code': group['code']})
    fake_redis.set(f"position:{users['second_user']}", json.dumps({'lat': 45.1, 'lon': 9.1, 'ts': 2000}))
    fake_redis.set(f"group_position:{users['second_user']}", json.dumps({'lat': 45.0, 'lon': 9.0, 'ts': 1000}))
    fake_redis.set(f"group_position:{users['third_user']}", 'not json')

    calls = []
    real_mget = fake_redis.mget
    monkeypatch.setattr(fake_redis, 'mget', lambda keys: calls.append(keys) or real_mget(keys))
    _login(client, 'owner_user')
    data = client.get('/api/groups/positions').get_json()
    assert data['group_count'] == 2 and data['ttl_sec'] == 90
    # in both groups but shown once, with the most recent of its two positions (the GPS session)
    assert [(p['username'], p['lat'], p['ts']) for p in data['positions']] == [('second_user', 45.1, 2000)]
    assert len(calls) == 1

    calls.clear()
    groups = client.get('/api/groups').get_json()['groups']
    assert [g['sharing_count'] for g in groups] == [1, 1] and len(calls) == 1

    _login(client, 'third_user')  # not sharing anything valid: sees the others, not itself
    assert [p['username'] for p in client.get('/api/groups/positions').get_json()['positions']] == ['second_user']
    _login(client, 'second_user')
    assert client.get('/api/groups/positions').get_json()['positions'] == []


def test_double_join_at_the_same_moment_is_not_a_server_error(app, users, client, fake_redis, monkeypatch):
    """Two identical joins (double tap): the second insert collides with the first, the answer is 'already member'."""
    _login(client, 'owner_user')
    group = _create(client)
    _login(client, 'second_user')
    with app.app_context():  # the other request has just added the membership...
        db.session.add(GroupMembership(user_id=users['second_user'], group_id=group['id'], role='member'))
        db.session.commit()
    real = groups_module._my_membership
    calls = []

    def stale_first_look(group_id):  # ...but this one checked before it existed
        calls.append(group_id)
        return None if len(calls) == 1 else real(group_id)

    monkeypatch.setattr(groups_module, '_my_membership', stale_first_look)
    response = client.post('/api/groups/join', json={'code': group['code']})
    assert response.status_code == 200
    assert response.get_json()['already_member'] is True
    with app.app_context():
        assert GroupMembership.query.filter_by(group_id=group['id']).count() == 2


def test_true_and_false_are_not_coordinates(app, users, client, fake_redis):
    _login(client, 'owner_user')
    client.patch('/api/settings', json={'sensors_enabled': True, 'share_location_with_groups': True})
    assert client.post('/api/groups/position', json={'lat': True, 'lon': True}).status_code == 422
    group = _create(client)
    sent = client.post(f"/api/groups/{group['id']}/messages", json={'kind': 'location', 'lat': True, 'lon': False})
    assert sent.status_code == 422


def test_the_shared_position_lasts_position_ttl(app, users, client, fake_redis):
    """Same time as the position of the GPS session and as the Privacy page: before, the map kept 90 s fixed."""
    app.config['POSITION_TTL'] = 45
    _login(client, 'owner_user')
    group = _create(client)
    client.patch('/api/settings', json={'sensors_enabled': True, 'share_location_with_groups': True})
    shared = client.post('/api/groups/position', json={'lat': 45.46, 'lon': 9.19}).get_json()
    assert shared['expires_in_sec'] == 45
    assert fake_redis.ttl[f"group_position:{users['owner_user']}"] == 45
    assert client.get(f"/api/groups/{group['id']}/positions").get_json()['ttl_sec'] == 45
    assert client.get('/api/groups/positions').get_json()['ttl_sec'] == 45
    assert client.get('/api/legal/privacy').get_json()['retention']['live_position_sec'] == 45
