"""Phase 5: notifications, score, bikes, group chat (REST + WebSocket handler) and admin CLI."""
import fnmatch
import importlib.util
import json
from datetime import datetime, timedelta
from pathlib import Path

import pytest

from app import realtime
from app.api import chat as chat_api
from app.api import score as score_api
from app.auth.models import Bike, FallEvent, RiderShift, User
from app.delivery.models import Order, utcnow
from app.messaging import service as messaging_service
from app.messaging.models import ChatMessage, Notification
from app.messaging.service import notify
from extensions import db


def _login(client, email):
    client.post('/api/auth/logout')
    assert client.post('/api/auth/login', json={'identity': email, 'password': 'password'}).status_code == 200


@pytest.fixture
def users(app, user_factory):
    with app.app_context():
        created = {name: user_factory(f'{name}@example.com', name) for name in ('anna', 'bruno', 'carla')}
        db.session.commit()
        return {name: u.id for name, u in created.items()}


@pytest.fixture
def published(monkeypatch):
    events = []
    monkeypatch.setattr(chat_api, 'publish_chat_event', lambda group_id, event: events.append((group_id, event)))
    monkeypatch.setattr(realtime, 'publish_chat_event', lambda group_id, event: events.append((group_id, event)))
    monkeypatch.setattr(messaging_service, 'publish_chat_event', lambda group_id, event: events.append((group_id, event)))
    return events


# ------------------------------------------------------------------ notifications

def test_notifications_crud(app, client, users):
    with app.app_context():
        notify([users['anna'], users['anna'], None], 'consegne', 'Uno', 'corpo', link='/consegne')
        notify([users['anna']], 'gruppi', 'Due')
        notify([users['bruno']], 'sistema', 'Di Bruno')
        with pytest.raises(ValueError):
            notify([users['anna']], 'spam', 'x')

    _login(client, 'anna@example.com')
    body = client.get('/api/notifications').get_json()
    assert [n['title'] for n in body['notifications']] == ['Due', 'Uno']
    assert body['unread_count'] == 2
    newest = body['notifications'][0]['id']
    assert client.get(f'/api/notifications?after_id={newest}').get_json()['notifications'] == []

    first = body['notifications'][1]['id']
    assert client.post(f'/api/notifications/{first}/read').get_json()['unread_count'] == 1
    assert client.post(f'/api/notifications/{first}/read', json={'read': False}).get_json()['unread_count'] == 2
    assert client.post('/api/notifications/read-all').get_json()['unread_count'] == 0
    assert client.delete(f'/api/notifications/{first}').status_code == 200
    with app.app_context():
        bruno_note = Notification.query.filter_by(user_id=users['bruno']).one().id
    assert client.delete(f'/api/notifications/{bruno_note}').status_code == 404  # not mine
    assert client.delete('/api/notifications').get_json()['deleted'] == 1


def test_mark_all_and_delete_all_act_on_the_category_on_screen(app, client, users):
    """Before, "Elimina tutte" with the filter "Consegne" on screen deleted the SOS of the groups too."""
    with app.app_context():
        notify([users['anna']], 'consegne', 'Ordine 1')
        notify([users['anna']], 'consegne', 'Ordine 2')
        notify([users['anna']], 'sicurezza', 'SOS da Bruno')
    _login(client, 'anna@example.com')

    marked = client.post('/api/notifications/read-all?category=consegne').get_json()
    assert marked['unread_count'] == 1  # the SOS is still unread
    deleted = client.delete('/api/notifications?category=consegne').get_json()
    assert deleted['deleted'] == 2 and deleted['unread_count'] == 1
    left = client.get('/api/notifications').get_json()['notifications']
    assert [n['title'] for n in left] == ['SOS da Bruno']

    response = client.delete('/api/notifications?category=spam')
    assert response.status_code == 422
    assert 'category' in response.get_json()['fields']
    assert client.delete('/api/notifications').get_json()['deleted'] == 1  # without a category: all of them


# ------------------------------------------------------------------ score

def test_score_formula(app, client, users, monkeypatch):
    today = datetime(2026, 9, 24).date()
    monkeypatch.setattr(score_api, 'local_today', lambda: today)
    with app.app_context():
        uid = users['anna']
        db.session.add_all([
            RiderShift(user_id=uid, session_id='s1', gpx_path='', total_distance_km=5, duration_min=20,
                       started_at=datetime(2026, 9, 24, 8), created_at=datetime(2026, 9, 24, 8, 20)),
            RiderShift(user_id=uid, session_id='s2', gpx_path='', total_distance_km=2, duration_min=10,
                       started_at=datetime(2026, 9, 24, 9), created_at=datetime(2026, 9, 24, 9, 10)),
            FallEvent(user_id=uid, session_id='s2', latitude=45, longitude=9, timestamp=datetime(2026, 9, 24, 9, 5)),
            Order(restaurant_name='A', pickup_address='x', delivery_address='y', pay=5, status='delivered', rider_id=uid,
                  delivered_at=datetime(2026, 9, 24, 10), due_at=datetime(2026, 9, 24, 10, 30)),
            Order(restaurant_name='B', pickup_address='x', delivery_address='y', pay=5, status='delivered', rider_id=uid,
                  delivered_at=datetime(2026, 9, 24, 11), due_at=datetime(2026, 9, 24, 10, 30)),
            Order(restaurant_name='C', pickup_address='x', delivery_address='y', pay=5, status='delivered', rider_id=uid,
                  delivered_at=datetime(2026, 9, 23, 11)),
        ])
        db.session.commit()

    _login(client, 'anna@example.com')
    body = client.get('/api/score?days=2').get_json()
    assert body['rules'] == {'per_km': 10, 'per_delivery': 20, 'per_on_time': 5}
    yesterday, day = body['days']
    assert day == {'date': '2026-09-24', 'score': 7 * 10 + 2 * 20 + 1 * 5, 'distance_km': 7, 'deliveries': 2,
                   'on_time': 1, 'punctuality': 0.5, 'safe_riding': 0.5}
    assert yesterday['score'] == 20 and yesterday['punctuality'] is None and yesterday['safe_riding'] is None
    assert body['total'] == 135


# ------------------------------------------------------------------ bikes

def test_bikes_public_stats_and_linking(app, client, users):
    with app.app_context():
        bike = Bike(bike_id='013-009', label='Bici di prova', model='Rockrider', history='2026: nata\n2020: comprata')
        spare = Bike(bike_id='013-010', label='Altra')
        db.session.add_all([bike, spare])
        db.session.flush()
        db.session.add_all([
            RiderShift(user_id=users['bruno'], session_id='b1', gpx_path='', total_distance_km=10, duration_min=30, bike_id=bike.id),
            RiderShift(user_id=users['carla'], session_id='b2', gpx_path='', total_distance_km=5, duration_min=15, bike_id=bike.id),
        ])
        db.session.commit()

    public = client.get('/api/bikes/013-009').get_json()['bike']  # no login needed
    assert public['stats'] == {'rides': 2, 'distance_km': 15.0, 'riders': 2, 'co2_saved_kg': 1.8,
                               'last_ride_at': public['stats']['last_ride_at']}
    assert public['history'] == ['2026: nata', '2020: comprata']
    assert public['in_use'] is False and public['is_mine'] is False
    assert client.get('/api/bikes/nope').status_code == 404
    assert client.post('/api/bikes/013-009/link').status_code == 401

    _login(client, 'anna@example.com')
    assert client.post('/api/bikes/013-009/link').get_json()['bike']['is_mine'] is True
    assert client.get('/api/bikes/mine').get_json()['bike']['code'] == '013-009'
    client.post('/api/bikes/013-010/link')  # one bike at a time
    assert client.get('/api/bikes/mine').get_json()['bike']['code'] == '013-010'
    assert client.get('/api/bikes/013-009').get_json()['bike']['in_use'] is False

    _login(client, 'bruno@example.com')
    client.post('/api/bikes/013-010/link')  # takes it from Anna, who is told
    _login(client, 'anna@example.com')
    assert client.get('/api/bikes/mine').get_json()['bike'] is None
    assert any('taken by another rider' in n['title'] for n in client.get('/api/notifications').get_json()['notifications'])
    listed = client.get('/api/bikes').get_json()['bikes']
    assert [b['code'] for b in listed] == ['013-009', '013-010']
    _login(client, 'bruno@example.com')
    assert client.delete('/api/bikes/mine').get_json() == {'bike': None}


# ------------------------------------------------------------------ chat

def _group(client, name='Chat Navigli'):
    return client.post('/api/groups', json={'name': name}).get_json()


def test_chat_history_and_rest_sending(app, client, users, published):
    _login(client, 'anna@example.com')
    group = _group(client)
    sent = client.post(f"/api/groups/{group['id']}/messages", json={'text': '  Ciao a tutti  '})
    assert sent.status_code == 201
    message = sent.get_json()['message']
    assert message['text'] == 'Ciao a tutti' and message['username'] == 'anna'
    assert published == [(group['id'], {'type': 'message', 'message': message})]
    location = client.post(f"/api/groups/{group['id']}/messages", json={'kind': 'location', 'lat': 45.46, 'lon': 9.19}).get_json()
    assert location['message']['kind'] == 'location'
    assert client.post(f"/api/groups/{group['id']}/messages", json={'text': ''}).status_code == 422
    assert client.post(f"/api/groups/{group['id']}/messages", json={'text': 'x' * 1001}).status_code == 422
    assert client.post(f"/api/groups/{group['id']}/messages", json={'kind': 'location', 'lat': 95, 'lon': 9}).status_code == 422

    history = client.get(f"/api/groups/{group['id']}/messages").get_json()
    assert [m['kind'] for m in history['messages']] == ['text', 'location'] and history['has_more'] is False
    older = client.get(f"/api/groups/{group['id']}/messages?before={location['message']['id']}").get_json()
    assert [m['text'] for m in older['messages']] == ['Ciao a tutti']

    _login(client, 'carla@example.com')  # not a member
    assert client.get(f"/api/groups/{group['id']}/messages").status_code == 404
    assert client.post(f"/api/groups/{group['id']}/messages", json={'text': 'intrusa'}).status_code == 404


def test_chat_pagination(app, client, users, published):
    _login(client, 'anna@example.com')
    group = _group(client)
    with app.app_context():
        db.session.add_all([ChatMessage(group_id=group['id'], user_id=users['anna'], text=f'm{i}') for i in range(55)])
        db.session.commit()
    page = client.get(f"/api/groups/{group['id']}/messages").get_json()
    assert len(page['messages']) == 50 and page['has_more'] is True
    assert page['messages'][-1]['text'] == 'm54'


def test_websocket_event_handler(app, users, published):
    with app.app_context():
        user = db.session.get(User, users['anna'])
        from app.auth.models import Group, GroupMembership
        group = Group(name='G', code='abc-defg-hij')
        db.session.add(group)
        db.session.flush()
        db.session.add(GroupMembership(user_id=user.id, group_id=group.id, role='owner'))
        db.session.commit()

        assert realtime.handle_client_event(user, group.id, json.dumps({'type': 'ping'})) == {'type': 'pong'}
        assert realtime.handle_client_event(user, group.id, 'not json')['type'] == 'error'
        assert realtime.handle_client_event(user, group.id, json.dumps({'type': 'boom'}))['type'] == 'error'
        assert realtime.handle_client_event(user, group.id, json.dumps({'type': 'message', 'text': ''}))['type'] == 'error'
        assert realtime.handle_client_event(user, group.id, json.dumps({'type': 'typing'})) is None
        assert realtime.handle_client_event(user, group.id, json.dumps({'type': 'message', 'text': 'via ws'})) is None
        assert realtime.handle_client_event(user, group.id, json.dumps({'type': 'location', 'lat': 45, 'lon': 9})) is None
        assert ChatMessage.query.count() == 2
        kinds = [event['type'] for _gid, event in published]
        assert kinds == ['typing', 'message', 'message']


def test_websocket_refuses_who_is_no_longer_a_member(app, users, published):
    with app.app_context():
        from app.auth.models import Group, GroupMembership
        group = Group(name='G', code='abc-defg-hij')
        db.session.add(group)
        db.session.flush()
        db.session.add(GroupMembership(user_id=users['anna'], group_id=group.id, role='owner'))
        db.session.commit()
        bruno = db.session.get(User, users['bruno'])  # removed while his chat was open

        for event in ({'type': 'message', 'text': 'ci sono ancora'}, {'type': 'location', 'lat': 45, 'lon': 9},
                      {'type': 'typing'}):
            assert realtime.handle_client_event(bruno, group.id, json.dumps(event)) is realtime.NOT_A_MEMBER
        assert ChatMessage.query.count() == 0 and published == []
        assert realtime.handle_client_event(bruno, group.id, json.dumps({'type': 'ping'})) == {'type': 'pong'}


def test_broadcast_action():
    removal = json.dumps({'type': 'member_removed', 'user_id': 7})
    assert realtime.broadcast_action(removal, 7) == 'leave'
    assert realtime.broadcast_action(removal, 8) == 'skip'  # internal: never forwarded to the others
    lookalike = json.dumps({'type': 'message', 'message': {'username': 'member_removed', 'text': '"member_removed"'}})
    assert realtime.broadcast_action(lookalike, 7) == 'send'


def test_ready_is_sent_only_after_redis_confirms_the_subscription():
    """The browser sees the socket open before the server subscribes to the group: a message sent in between was
    lost until a reload (an e2e test failed now and then). "ready" tells the app when to load the history again."""
    steps = []

    class PubSub:
        def get_message(self, timeout=0):
            steps.append(('confirmation read', timeout))

    class Socket:
        def send(self, data):
            steps.append(('sent', json.loads(data)))

    realtime.announce_ready(PubSub(), Socket())
    assert steps == [('confirmation read', realtime.SUBSCRIBE_CONFIRM_TIMEOUT_SEC), ('sent', {'type': 'ready'})]
    assert realtime.SUBSCRIBE_CONFIRM_TIMEOUT_SEC > 0  # 0 would only look at what has already arrived


def test_leaving_or_removing_a_member_closes_their_chat(app, client, users, published):
    _login(client, 'anna@example.com')
    group = _group(client)
    for name in ('bruno', 'carla'):
        _login(client, f'{name}@example.com')
        client.post('/api/groups/join', json={'code': group['code']})

    assert client.delete(f"/api/groups/{group['id']}/members/{users['carla']}").status_code == 200  # carla leaves
    _login(client, 'anna@example.com')
    assert client.delete(f"/api/groups/{group['id']}/members/{users['bruno']}").status_code == 200  # bruno removed
    _login(client, 'carla@example.com')
    client.post('/api/groups/join', json={'code': group['code']})
    assert client.post('/api/auth/delete-account', json={'password': 'password'}).status_code == 200

    removed = [event['user_id'] for gid, event in published if event['type'] == 'member_removed' and gid == group['id']]
    assert removed == [users['carla'], users['bruno'], users['carla']]


def test_origin_check():
    assert realtime.origin_allowed('https://localhost', 'localhost')
    assert realtime.origin_allowed(None, 'localhost')
    assert not realtime.origin_allowed('https://evil.example', 'localhost')


def test_group_join_and_sos_create_notifications(app, client, users, published):
    _login(client, 'anna@example.com')
    group = _group(client)
    _login(client, 'bruno@example.com')
    client.post('/api/groups/join', json={'code': group['code']})
    client.post('/api/sos', json={})
    _login(client, 'anna@example.com')
    notes = client.get('/api/notifications').get_json()['notifications']
    assert {n['category'] for n in notes} == {'gruppi', 'sicurezza'}
    assert {n['title'] for n in notes} == {'New member in Chat Navigli', '🚨 SOS from Bruno'}


def test_notifications_are_in_the_language_of_each_recipient(app, users):
    """Before, everybody got the Italian text, also with the app in English or Spanish."""
    with app.app_context():
        for name, language in (('anna', 'it'), ('bruno', 'es'), ('carla', 'fr')):
            db.session.get(User, users[name]).language = language
        db.session.commit()
        sent = messaging_service.notify_text(list(users.values()), 'consegne', 'order_new', link='/consegne',
                                             restaurant='Pizzeria Uno', pickup='Via A 1', delivery='Via B 2',
                                             total='12.50')
        assert sent == 3
        texts = {n.user_id: (n.title, n.body) for n in Notification.query}
    assert texts[users['anna']] == ('Nuovo ordine: Pizzeria Uno', 'Ritiro: Via A 1 • Consegna: Via B 2 • €12.50')
    assert texts[users['bruno']] == ('Nuevo pedido: Pizzeria Uno', 'Recogida: Via A 1 • Entrega: Via B 2 • 12.50 €')
    assert texts[users['carla']][0] == 'New order: Pizzeria Uno'  # French: English texts, like the app


def test_every_notification_text_exists_in_the_three_languages():
    import string

    from app.messaging.texts import APP_LANGUAGES, TEXTS, text_language

    def fields(versions, language):
        return {name for part in versions[language] for _text, name, _spec, _conv in string.Formatter().parse(part) if name}

    for key, versions in TEXTS.items():
        assert set(versions) == set(APP_LANGUAGES), key
        assert fields(versions, 'it') == fields(versions, 'en') == fields(versions, 'es'), key
    # same fallbacks as the app: the languages of world.js use English, unknown codes Italian
    assert [text_language(code) for code in ('it', 'EN', 'es', 'de', 'sq', None)] == ['it', 'en', 'es', 'en', 'it', 'it']


def test_deleting_account_removes_messages_and_notifications(app, client, users, published):
    _login(client, 'anna@example.com')
    group = _group(client)
    client.post(f"/api/groups/{group['id']}/messages", json={'text': 'ciao'})
    with app.app_context():
        notify([users['anna']], 'sistema', 'x')
    assert client.post('/api/auth/delete-account', json={'password': 'password'}).status_code == 200
    with app.app_context():
        assert ChatMessage.query.count() == 0
        assert Notification.query.count() == 0


# ------------------------------------------------------------------ CLI

def test_grant_and_revoke_admin_cli(app, users):
    runner = app.test_cli_runner()
    result = runner.invoke(args=['ror', 'grant-admin', 'ANNA@example.com'])
    assert result.exit_code == 0, result.output
    with app.app_context():
        assert db.session.get(User, users['anna']).has_role('admin')
    assert runner.invoke(args=['ror', 'revoke-admin', 'anna@example.com']).exit_code == 0
    with app.app_context():
        assert not db.session.get(User, users['anna']).has_role('admin')
    assert runner.invoke(args=['ror', 'grant-admin', 'nobody@example.com']).exit_code != 0


def test_expired_offer_cannot_be_accepted(app, client, users):
    with app.app_context():
        order = Order(restaurant_name='Tardi', pickup_address='x', delivery_address='y', pay=4,
                      expires_at=utcnow() - timedelta(seconds=1))
        db.session.add(order)
        db.session.commit()
        order_id = order.id
    _login(client, 'anna@example.com')
    assert client.post(f'/api/orders/{order_id}/accept').get_json()['error'] == 'order_unavailable'


def test_cleanup_gpx_cli(app, tmp_path, users):
    import os
    import time as time_module

    app.config['GPX_STORAGE_DIR'] = str(tmp_path)
    kept = tmp_path / 'kept.gpx'
    orphan = tmp_path / 'orphan.gpx'
    just_written = tmp_path / 'closing.gpx'  # the GPS worker saves its route right after
    for path in (kept, orphan, just_written):
        path.write_text('<gpx/>')
    two_hours_ago = time_module.time() - 2 * 3600
    os.utime(orphan, (two_hours_ago, two_hours_ago))
    with app.app_context():
        db.session.add(RiderShift(user_id=users['anna'], session_id='k', gpx_path=str(kept), total_distance_km=1, duration_min=1))
        db.session.commit()
    runner = app.test_cli_runner()
    dry = runner.invoke(args=['ror', 'cleanup-gpx', '--dry-run'])
    assert 'would delete orphan.gpx' in dry.output and orphan.exists()
    assert runner.invoke(args=['ror', 'cleanup-gpx']).exit_code == 0
    assert kept.exists() and just_written.exists() and not orphan.exists()


class FakeSortedSets:
    """The Redis sorted-set commands used to count the open chats."""

    def __init__(self):
        self.sets = {}

    def zremrangebyscore(self, key, low, high):
        members = self.sets.setdefault(key, {})
        for member, score in list(members.items()):
            if (low == '-inf' or score >= low) and score <= high:
                del members[member]

    def zcard(self, key):
        return len(self.sets.get(key, {}))

    def zadd(self, key, mapping):
        self.sets.setdefault(key, {}).update(mapping)

    def zrem(self, key, member):
        self.sets.get(key, {}).pop(member, None)

    def expire(self, key, seconds):
        pass

    def scan_iter(self, pattern):
        return [key for key in self.sets if fnmatch.fnmatchcase(key, pattern)]

    def delete(self, *keys):
        for key in keys:
            self.sets.pop(key, None)


def test_one_account_cannot_keep_more_than_five_chats_open(app):
    """Every open chat keeps a server thread busy: one account must not be able to take them all."""
    redis = FakeSortedSets()
    with app.app_context():
        opened = [realtime.register_socket(redis, 7, f's{i}', now=1000) for i in range(realtime.MAX_SOCKETS_PER_USER)]
        assert all(opened)
        assert realtime.register_socket(redis, 7, 'one-too-many', now=1000) is False
        assert realtime.register_socket(redis, 8, 'other-user', now=1000) is True  # per account

        realtime.unregister_socket(redis, 7, 's0')  # a chat is closed: a new one can open
        assert realtime.register_socket(redis, 7, 's5', now=1001) is True
        assert realtime.register_socket(redis, 7, 's6', now=1001) is False

        # sockets that died without closing stop counting once they are no longer refreshed
        later = 1001 + realtime.SOCKET_STALE_SEC + 1
        realtime.refresh_socket(redis, 7, 's5', now=later)
        assert realtime.register_socket(redis, 7, 's7', now=later) is True
        assert redis.zcard('ws_sockets:7') == 2


def test_ws_service_start_forgets_the_chats_of_the_previous_process(app, monkeypatch):
    """A restart kills the sockets without their cleanup: after an update the third of 3 chats was refused."""
    redis = FakeSortedSets()
    with app.app_context():
        for i in range(3):
            assert realtime.register_socket(redis, 7, f'before-restart-{i}', now=1000)
        assert realtime.register_socket(redis, 8, 'other-user', now=1000)

    spec = importlib.util.spec_from_file_location('gunicorn_ws_conf', Path(__file__).parents[1] / 'gunicorn_ws.conf.py')
    gunicorn_conf = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(gunicorn_conf)
    monkeypatch.setattr(gunicorn_conf.redis, 'Redis', lambda **_kwargs: redis)

    class Server:
        class log:  # noqa: N801 - same shape as gunicorn's server.log
            info = warning = staticmethod(lambda *args: None)

    gunicorn_conf.on_starting(Server())
    assert redis.sets == {}
    with app.app_context():
        assert all(realtime.register_socket(redis, 7, f'after-restart-{i}', now=1001) for i in range(3))


def test_chat_websocket_pings_and_limits_message_size(app):
    """Without pings a phone gone without coverage kept its chat (thread and one of the 5 per account) for hours;
    without a size limit one 200 MB message took 400 MB of server memory."""
    options = app.config['SOCK_SERVER_OPTIONS']
    assert 0 < options['ping_interval'] < realtime.SOCKET_STALE_SEC
    assert 4 * chat_api.MAX_TEXT < options['max_message_size'] <= 64 * 1024


def test_chat_limit_does_not_block_when_redis_is_down(app):
    class Down:
        def __getattr__(self, name):
            raise ConnectionError('redis down')

    with app.app_context():
        assert realtime.register_socket(Down(), 7, 's0') is True


def test_cleanup_gpx_keeps_a_paused_ride_for_a_week(app, tmp_path):
    """The app keeps a paused session and the rider may end it the next day: its points must still be there."""
    import os
    import time as time_module

    app.config['GPX_STORAGE_DIR'] = str(tmp_path)
    yesterday = tmp_path / '7_paused.gpx.tmp'
    abandoned = tmp_path / '7_abandoned.gpx.tmp'
    for path, days in ((yesterday, 2), (abandoned, 8)):
        path.write_text('45.0,9.0,,1790000000000\n')
        old = time_module.time() - days * 24 * 3600
        os.utime(path, (old, old))
    assert app.test_cli_runner().invoke(args=['ror', 'cleanup-gpx']).exit_code == 0
    assert yesterday.exists() and not abandoned.exists()
