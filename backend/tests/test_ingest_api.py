"""Ingestion API (fastapi_app/main.py): what reaches RabbitMQ from /stream and /session/end.

Every point of a ride passes through here and then through the GPS worker. Before these tests nothing
checked this path automatically (the e2e tests never send GPS points). RabbitMQ and the Flask session
check are replaced by fakes: the tests run without the Docker stack.
"""
import importlib.util
import json
import threading
import time
from pathlib import Path
from types import SimpleNamespace

import pika
import pytest
import requests
from fastapi.testclient import TestClient

MAIN = Path(__file__).resolve().parents[1] / 'fastapi_app' / 'main.py'
SESSION = '3f2b8c1e-7d4a-4e0b-9a51-2c6d8e9f0a17'
T0 = 1_790_000_000_000  # ms
RIDER = {'authenticated': True, 'user_id': 42, 'sensors_enabled': True}


@pytest.fixture(scope='module')
def ingest():
    spec = importlib.util.spec_from_file_location('ror_ingest_main', MAIN)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class FakeResponse:
    def __init__(self, status_code, data=None):
        self.status_code = status_code
        self._data = data

    def json(self):
        if self._data is None:
            raise ValueError('not JSON')  # e.g. the HTML error page of a proxy
        return self._data


class FakePublisher:
    def __init__(self):
        self.messages = []
        self.error = None

    def publish(self, body):
        if self.error is not None:
            raise self.error
        self.messages.append(json.loads(body))


@pytest.fixture
def api(ingest, monkeypatch):
    """The ingestion API with a fake Flask session check (a rider with the sensors on) and a fake RabbitMQ."""
    checks = []
    state = SimpleNamespace(session=FakeResponse(200, dict(RIDER)))

    def check_session(url, cookies=None, timeout=None):
        checks.append({'url': url, 'cookies': cookies, 'timeout': timeout})
        if isinstance(state.session, Exception):
            raise state.session
        return state.session

    publisher = FakePublisher()
    monkeypatch.setattr(ingest.requests, 'get', check_session)
    monkeypatch.setattr(ingest, 'publisher', publisher)
    return SimpleNamespace(client=TestClient(ingest.app), publisher=publisher, checks=checks, state=state)


def point(**overrides):
    """A point as the app sends it (src/context/RideTrackingContext.jsx)."""
    data = {'session_id': SESSION, 'lat': 45.4642, 'lon': 9.19, 'speed_kmh': 18.25, 'timestamp': T0}
    data.update(overrides)
    return data


# --------------------------------------------------------------------------- /stream

def test_points_reach_rabbitmq_with_the_rider_of_the_session(api):
    response = api.client.post(
        '/stream',
        json=[point(), point(timestamp=T0 + 4000, speed_kmh=None), point(timestamp=T0 + 8000, is_confirmed_fall=True)],
        headers={'cookie': 'session=abc; remember_token=def; _ga=tracker'},
    )

    assert response.status_code == 200
    assert response.json() == {'status': 'ok', 'count': 3}
    assert api.publisher.messages == [
        {'type': 'point', 'user_id': '42', 'session_id': SESSION, 'lat': 45.4642, 'lon': 9.19, 'speed_kmh': 18.25,
         'timestamp': T0, 'is_confirmed_fall': False, 'is_cancelled_fall': False},
        {'type': 'point', 'user_id': '42', 'session_id': SESSION, 'lat': 45.4642, 'lon': 9.19, 'speed_kmh': None,
         'timestamp': T0 + 4000, 'is_confirmed_fall': False, 'is_cancelled_fall': False},
        {'type': 'point', 'user_id': '42', 'session_id': SESSION, 'lat': 45.4642, 'lon': 9.19, 'speed_kmh': 18.25,
         'timestamp': T0 + 8000, 'is_confirmed_fall': True, 'is_cancelled_fall': False},
    ]
    # only the login cookies go to Flask, with a time limit
    assert api.checks == [{'url': 'http://web:8000/auth/check_session',
                           'cookies': {'session': 'abc', 'remember_token': 'def'}, 'timeout': 5}]


def test_the_remember_cookie_alone_is_enough(api):
    """The app restarted during a ride: no session cookie yet, the account is remembered."""
    response = api.client.post('/stream', json=[point()], headers={'cookie': 'remember_token=def'})
    assert response.status_code == 200
    assert api.checks[0]['cookies'] == {'remember_token': 'def'}


def test_points_without_a_gps_fix_are_accepted(api):
    """The first samples before the GPS answers: the worker discards them, the request must not fail."""
    response = api.client.post('/stream', json=[point(lat=None, lon=None, speed_kmh=None)])
    assert response.status_code == 200
    assert api.publisher.messages[0]['lat'] is None


@pytest.mark.parametrize('extra', [
    {'user_id': 7},          # the rider comes from the session, never from the client
    {'acc_x': 0.3},          # no raw sensor data leaves the phone
    {'gps_time': T0},
])
def test_fields_the_app_must_not_send_are_refused(api, extra):
    response = api.client.post('/stream', json=[point(**extra)])
    assert response.status_code == 422
    assert api.publisher.messages == []


@pytest.mark.parametrize('bad', [
    {'lat': 90.5}, {'lat': -91}, {'lon': 180.1}, {'lon': -181}, {'speed_kmh': -1},
    {'timestamp': 0}, {'timestamp': -5}, {'session_id': 'not-a-uuid'},
])
def test_impossible_values_are_refused(api, bad):
    response = api.client.post("/stream", json=[point(), point(**{"timestamp": T0 + 1000, **bad})])
    assert response.status_code == 422
    assert api.publisher.messages == []  # the whole batch: the app keeps it and the error is visible


def test_a_batch_is_at_most_200_points(api):
    too_many = [point(timestamp=T0 + i) for i in range(201)]
    assert api.client.post('/stream', json=too_many).status_code == 422
    assert api.publisher.messages == []

    response = api.client.post('/stream', json=too_many[:200])
    assert response.status_code == 200
    assert response.json()['count'] == 200
    assert len(api.publisher.messages) == 200


def test_an_empty_batch_publishes_nothing(api):
    response = api.client.post('/stream', json=[])
    assert response.status_code == 200
    assert response.json() == {'status': 'ok', 'count': 0}
    assert api.publisher.messages == []


@pytest.mark.parametrize('flask_answer', [
    FakeResponse(401, {'authenticated': False}),
    FakeResponse(200, {'authenticated': False}),
])
def test_without_a_valid_session_it_is_401(api, flask_answer):
    """401 sends the rider to the login: only when Flask says that the session is not valid."""
    api.state.session = flask_answer
    response = api.client.post('/stream', json=[point()])
    assert response.status_code == 401
    assert api.publisher.messages == []


@pytest.mark.parametrize('flask_problem', [
    requests.ConnectionError('web restarting'),
    requests.Timeout('web slow'),
    FakeResponse(502),               # nginx/gunicorn error page
    FakeResponse(200),               # 200 without JSON
])
def test_when_flask_cannot_answer_it_is_503_not_401(api, flask_problem):
    """Before, a slow Flask paused the ride and logged the rider out; now the app keeps the points and retries."""
    api.state.session = flask_problem
    response = api.client.post('/stream', json=[point()])
    assert response.status_code == 503
    assert api.publisher.messages == []


def test_with_the_sensors_off_it_is_403(api):
    api.state.session = FakeResponse(200, {**RIDER, 'sensors_enabled': False})
    response = api.client.post('/stream', json=[point()])
    assert response.status_code == 403
    assert api.publisher.messages == []


@pytest.mark.parametrize('error', [pika.exceptions.ConnectionBlockedTimeout(), pika.exceptions.AMQPConnectionError()])
def test_when_rabbitmq_does_not_take_the_points_it_is_503(api, error):
    """503: the app keeps the points for its next attempt (a 200 would make it delete them)."""
    api.publisher.error = error
    response = api.client.post('/stream', json=[point()])
    assert response.status_code == 503


# --------------------------------------------------------------------------- /session/end

def test_the_end_of_a_session_reaches_rabbitmq(api):
    response = api.client.post('/session/end', json={'session_id': SESSION}, headers={'cookie': 'session=abc'})
    assert response.status_code == 200
    assert api.publisher.messages == [{'type': 'session_end', 'user_id': '42', 'session_id': SESSION}]


def test_the_end_of_a_session_needs_a_valid_session(api):
    api.state.session = FakeResponse(401, {'authenticated': False})
    assert api.client.post('/session/end', json={'session_id': SESSION}).status_code == 401
    api.state.session = requests.ConnectionError('web restarting')
    assert api.client.post('/session/end', json={'session_id': SESSION}).status_code == 503
    assert api.publisher.messages == []


def test_the_end_of_a_session_is_saved_even_with_the_sensors_off(api):
    """The rider may turn the sensors off during the ride: the route recorded until then is still closed."""
    api.state.session = FakeResponse(200, {**RIDER, 'sensors_enabled': False})
    assert api.client.post('/session/end', json={'session_id': SESSION}).status_code == 200
    assert api.publisher.messages[0]['type'] == 'session_end'


def test_the_end_of_a_session_with_other_fields_or_a_bad_id_is_refused(api):
    assert api.client.post('/session/end', json={'session_id': SESSION, 'user_id': 7}).status_code == 422
    assert api.client.post('/session/end', json={'session_id': 'x'}).status_code == 422
    assert api.publisher.messages == []


def test_the_end_of_a_session_not_taken_by_rabbitmq_is_503(api):
    api.publisher.error = pika.exceptions.AMQPConnectionError()
    assert api.client.post('/session/end', json={'session_id': SESSION}).status_code == 503


def test_healthz_does_not_need_flask(api):
    api.state.session = requests.ConnectionError('web down')
    response = api.client.get('/healthz')
    assert response.status_code == 200
    assert response.json() == {'status': 'ok'}
    assert api.checks == []


# --------------------------------------------------------------------------- RabbitMQPublisher

class FakeChannel:
    def __init__(self, errors=()):
        self.errors = list(errors)
        self.published = []
        self.declared = None
        self.confirms = False

    def queue_declare(self, queue, durable):
        self.declared = (queue, durable)

    def confirm_delivery(self):
        self.confirms = True

    def basic_publish(self, exchange, routing_key, body, properties):
        if self.errors:
            raise self.errors.pop(0)
        self.published.append((exchange, routing_key, body, properties.delivery_mode))


class FakeConnection:
    def __init__(self, channel, idle_errors=()):
        self._channel = channel
        self.idle_errors = list(idle_errors)
        self.is_closed = False
        self.is_open = True
        self.idle_calls = []

    def channel(self):
        return self._channel

    def process_data_events(self, time_limit):
        self.idle_calls.append(time_limit)
        error = self.idle_errors.pop(0) if self.idle_errors else None
        if error is not None:
            raise error


@pytest.fixture
def broker(ingest, monkeypatch):
    """pika.BlockingConnection replaced: each new connection takes the next channel of ``channels``."""
    made = SimpleNamespace(params=[], connections=[], channels=[])

    def connect(params):
        made.params.append(params)
        connection = FakeConnection(made.channels.pop(0))
        made.connections.append(connection)
        return connection

    monkeypatch.setattr(ingest.pika, 'BlockingConnection', connect)
    return made


def test_the_publisher_waits_for_the_broker_confirmation_and_keeps_the_messages(ingest, broker):
    channel = FakeChannel()
    broker.channels = [channel]
    publisher = ingest.RabbitMQPublisher()

    publisher.publish(b'{"n": 1}')
    publisher.publish(b'{"n": 2}')

    assert len(broker.params) == 1  # one connection, reused
    params = broker.params[0]
    assert params.blocked_connection_timeout == ingest.RABBITMQ_BLOCKED_TIMEOUT_SEC
    assert params.heartbeat == 30
    assert channel.declared == (ingest.RABBITMQ_QUEUE, True)  # durable queue
    assert channel.confirms is True                             # publisher confirms
    assert channel.published == [('', ingest.RABBITMQ_QUEUE, b'{"n": 1}', 2),  # persistent messages
                                 ('', ingest.RABBITMQ_QUEUE, b'{"n": 2}', 2)]


def test_a_lost_connection_is_reopened_and_the_message_is_not_lost(ingest, broker):
    broken = FakeChannel(errors=[pika.exceptions.StreamLostError('connection reset')])
    fresh = FakeChannel()
    broker.channels = [broken, fresh]
    publisher = ingest.RabbitMQPublisher()

    publisher.publish(b'point')

    assert broken.published == []
    assert fresh.published == [('', ingest.RABBITMQ_QUEUE, b'point', 2)]


def test_a_blocked_broker_is_an_error_at_once_and_the_next_publish_reconnects(ingest, broker):
    """Disk or memory alarm: no second 10-second wait inside the same request."""
    blocked = FakeChannel(errors=[pika.exceptions.ConnectionBlockedTimeout()])
    fresh = FakeChannel()
    broker.channels = [blocked, fresh]
    publisher = ingest.RabbitMQPublisher()

    with pytest.raises(pika.exceptions.ConnectionBlockedTimeout):
        publisher.publish(b'point')
    assert len(broker.params) == 1

    publisher.publish(b'point')
    assert len(broker.params) == 2
    assert fresh.published == [('', ingest.RABBITMQ_QUEUE, b'point', 2)]


def test_keep_alive_answers_the_heartbeats_and_drops_a_dead_connection(ingest, broker, monkeypatch):
    class Stop(Exception):
        pass

    broker.channels = [FakeChannel()]
    publisher = ingest.RabbitMQPublisher()
    publisher.publish(b'point')
    connection = broker.connections[0]
    connection.idle_errors = [None, pika.exceptions.StreamLostError('missed heartbeats')]

    real_sleep = time.sleep
    test_thread = threading.current_thread()
    rounds = []

    def fake_sleep(seconds):
        if threading.current_thread() is not test_thread:
            return real_sleep(seconds)  # the keep-alive thread started by the module itself
        rounds.append(seconds)
        if len(rounds) > 3:
            raise Stop
        return None

    monkeypatch.setattr(ingest.time, 'sleep', fake_sleep)
    with pytest.raises(Stop):
        publisher.keep_alive(every_sec=10)

    assert rounds == [10, 10, 10, 10]
    assert connection.idle_calls == [0, 0]  # fine, then dead; the third round has no connection to keep alive
    assert publisher._connection is None    # the next publish opens a new one
