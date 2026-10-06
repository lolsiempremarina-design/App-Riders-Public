"""GPS worker (gps_worker/worker_consumer.py): what happens to each message taken from RabbitMQ.

on_message decides whether a point is kept (ack), dropped for good (reject) or retried later (nack after a
delay), and writes the GPX, the live position and the route row. Before these tests nothing checked it
automatically. RabbitMQ, PostgreSQL and Redis are fakes here; the SQL itself is checked against the
migrated schema by test_worker_postgres.py.
"""
import json
from pathlib import Path
from types import SimpleNamespace

import psycopg
import pytest
import redis

SESSION = '3f2b8c1e-7d4a-4e0b-9a51-2c6d8e9f0a17'
T0 = 1_790_000_000_000  # ms


class FakeDatabase:
    """Records the statements; ``fail(prefix, error)`` makes the next statement starting with prefix fail."""

    def __init__(self):
        self.statements = []
        self.route_row = None  # what SELECT ... FROM rider_shifts returns
        self.failures = []

    def fail(self, prefix, error, times=1):
        self.failures.extend([(prefix, error)] * times)

    def connect(self):
        return FakeDbConnection(self)

    def run(self, sql, params):
        sql = ' '.join(sql.split())
        for index, (prefix, error) in enumerate(self.failures):
            if sql.startswith(prefix):
                del self.failures[index]
                raise error
        self.statements.append((sql, params))

    def executed(self, prefix):
        return [params for sql, params in self.statements if sql.startswith(prefix)]


class FakeDbConnection:
    def __init__(self, database):
        self.database = database

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def cursor(self):
        return FakeCursor(self.database)


class FakeCursor(FakeDbConnection):
    def execute(self, sql, params):
        self.database.run(sql, params)

    def fetchone(self):
        return self.database.route_row


class FakeRedis:
    def __init__(self):
        self.values = {}
        self.ttls = {}
        self.error = None

    def set(self, key, value, ex=None):
        if self.error is not None:
            raise self.error
        self.values[key] = json.loads(value)
        self.ttls[key] = ex

    def delete(self, key):
        if self.error is not None:
            raise self.error
        self.values.pop(key, None)


class FakeChannel:
    def __init__(self):
        self.acked, self.rejected, self.nacked, self.timers = [], [], [], []
        self.connection = SimpleNamespace(call_later=lambda delay, callback: self.timers.append((delay, callback)))

    def basic_ack(self, delivery_tag):
        self.acked.append(delivery_tag)

    def basic_reject(self, delivery_tag, requeue):
        self.rejected.append((delivery_tag, requeue))

    def basic_nack(self, delivery_tag, requeue):
        self.nacked.append((delivery_tag, requeue))


@pytest.fixture
def worker(consumer, tmp_path, monkeypatch):
    from stream_manager import GPXStreamManager

    database, cache = FakeDatabase(), FakeRedis()
    monkeypatch.setattr(consumer, 'stream_mgr', GPXStreamManager(str(tmp_path), pause_gap_sec=120))
    monkeypatch.setattr(consumer, 'redis_client', cache)
    monkeypatch.setattr(consumer, 'get_db_conn', database.connect)
    monkeypatch.setattr(consumer, 'transient_failures', 0)
    channel = FakeChannel()
    tags = iter(range(1, 10_000))

    def deliver(message):
        """One message from the queue; returns its delivery tag."""
        tag = next(tags)
        body = message if isinstance(message, bytes) else json.dumps(message).encode('utf-8')
        consumer.on_message(channel, SimpleNamespace(delivery_tag=tag), None, body)
        return tag

    return SimpleNamespace(module=consumer, db=database, cache=cache, channel=channel, dir=tmp_path,
                           deliver=deliver)


def point(i=0, **overrides):
    """A point as fastapi_app/main.py publishes it."""
    message = {'type': 'point', 'user_id': '42', 'session_id': SESSION, 'lat': 45.0 + i * 0.001, 'lon': 9.0,
               'speed_kmh': 20.0, 'timestamp': T0 + i * 30_000, 'is_confirmed_fall': False,
               'is_cancelled_fall': False}
    message.update(overrides)
    return message


END = {'type': 'session_end', 'user_id': '42', 'session_id': SESSION}


def tmp_points(worker):
    path = worker.dir / f'42_{SESSION}.gpx.tmp'
    return path.read_text(encoding='utf-8').splitlines() if path.exists() else []


# --------------------------------------------------------------------------- points

def test_a_point_is_on_disk_and_on_the_live_map_when_it_is_acknowledged(worker):
    tag = worker.deliver(point())

    assert worker.channel.acked == [tag]
    assert tmp_points(worker) == [f'45.0,9.0,,{T0}']  # survives a restart of the worker
    assert worker.cache.values['position:42'] == {'lat': 45.0, 'lon': 9.0, 'session_id': SESSION, 'ts': T0}
    assert worker.cache.ttls['position:42'] == worker.module.POSITION_TTL
    assert worker.db.statements == []  # a normal point does not touch PostgreSQL


def test_a_point_without_gps_fix_is_acknowledged_but_not_saved(worker):
    tag = worker.deliver(point(lat=None, lon=None))
    assert worker.channel.acked == [tag]
    assert tmp_points(worker) == []
    assert worker.cache.values == {}


@pytest.mark.parametrize('timestamp', [0, 946_684_799_999, 5_000_000_000_000, 'yesterday', None])
def test_a_point_with_an_impossible_time_is_dropped_not_retried(worker, timestamp):
    tag = worker.deliver(point(timestamp=timestamp))
    assert worker.channel.acked == [tag]
    assert worker.channel.rejected == [] and worker.channel.timers == []
    assert tmp_points(worker) == []


def test_a_confirmed_fall_is_saved_in_fall_events(worker):
    fall = point(3, is_confirmed_fall=True)
    tag = worker.deliver(fall)

    assert worker.channel.acked == [tag]
    assert worker.db.executed('INSERT INTO fall_events') == [(SESSION, '42', fall['lat'], 9.0, (T0 + 90_000) / 1000)]
    assert len(tmp_points(worker)) == 1  # the point is part of the route too


def test_a_fall_without_coordinates_is_not_saved_and_does_not_block_the_queue(worker):
    tag = worker.deliver(point(lat=None, lon=None, is_confirmed_fall=True))
    assert worker.channel.acked == [tag]
    assert worker.db.statements == []


@pytest.mark.parametrize('body', [
    b'not json',
    b'[1, 2]',
    json.dumps({'type': 'accelerometer', 'user_id': '42'}).encode(),
    json.dumps({'type': 'point', 'user_id': '42', 'session_id': SESSION}).encode(),  # no timestamp
    json.dumps({'type': 'session_end', 'user_id': '42'}).encode(),                   # no session
])
def test_a_message_that_can_never_be_processed_is_rejected_without_retry(worker, body):
    """Requeued, it would fail again forever and keep the worker busy."""
    tag = worker.deliver(body)
    assert worker.channel.rejected == [(tag, False)]
    assert worker.channel.acked == [] and worker.channel.timers == []


def test_a_database_outage_retries_the_message_later_and_longer_each_time(worker):
    """PostgreSQL restarting: the fall is not lost and the worker does not loop on it."""
    worker.db.fail('INSERT INTO fall_events', psycopg.OperationalError('connection refused'), times=3)
    fall = point(2, is_confirmed_fall=True)

    tags = [worker.deliver(fall) for _ in range(3)]
    assert worker.channel.acked == [] and worker.channel.rejected == []
    assert [delay for delay, _ in worker.channel.timers] == [1.0, 2.0, 4.0]
    assert tmp_points(worker) == []  # nothing half done: the point is added with the fall on the retry

    # the nack runs from pika's timer, not right away
    assert worker.channel.nacked == []
    for _, nack in worker.channel.timers:
        nack()
    assert worker.channel.nacked == [(tag, True) for tag in tags]

    retry = worker.deliver(fall)  # PostgreSQL is back
    assert worker.channel.acked == [retry]
    assert len(worker.db.executed('INSERT INTO fall_events')) == 1
    assert len(tmp_points(worker)) == 1
    assert worker.module.transient_failures == 0

    worker.db.fail('INSERT INTO fall_events', psycopg.OperationalError('again'))
    worker.deliver(fall)
    assert worker.channel.timers[-1][0] == 1.0  # a new outage starts again from the shortest delay


def test_a_redis_outage_does_not_lose_the_points_nor_the_route(worker):
    """Redis only holds the live position for the groups: without it the ride is still recorded."""
    worker.cache.error = redis.ConnectionError('redis restarting')
    tags = [worker.deliver(point(i)) for i in range(3)]
    assert worker.channel.acked == tags
    assert len(tmp_points(worker)) == 3

    end = worker.deliver(END)
    assert worker.channel.acked[-1] == end and worker.channel.timers == []
    assert len(worker.db.executed('INSERT INTO rider_shifts')) == 1
    assert tmp_points(worker) == []


# --------------------------------------------------------------------------- end of a session

def test_the_end_of_a_session_writes_the_gpx_and_the_route_row(worker):
    from stream_manager import summarize_track

    for i in range(11):
        worker.deliver(point(i))
    tag = worker.deliver(END)

    assert worker.channel.acked[-1] == tag and worker.channel.rejected == []
    assert worker.db.executed('SELECT gpx_path') == [(42, SESSION)]
    [row] = worker.db.executed('INSERT INTO rider_shifts')
    session_id, user_id, gpx_path, distance_km, duration_min, started_s, ended_s, bike_user = row
    expected_km, expected_min = summarize_track([(45.0 + i * 0.001, 9.0, None, T0 + i * 30_000) for i in range(11)])
    assert (session_id, user_id, bike_user) == (SESSION, '42', 42)
    assert abs(distance_km - expected_km) < 1e-9 and duration_min == expected_min == 5.0
    assert (started_s, ended_s) == (T0 / 1000, (T0 + 300_000) / 1000)
    assert Path(gpx_path).read_text(encoding='utf-8').count('<trkpt') >= 2
    assert tmp_points(worker) == []                  # removed only after the row was saved
    assert 'position:42' not in worker.cache.values  # off the live map of the groups


def test_a_resumed_session_continues_the_route_already_saved(worker):
    """The app did not get the answer to its "end" and the rider resumed the same session."""
    for i in range(11):
        worker.deliver(point(i))
    worker.deliver(END)
    [first] = worker.db.executed('INSERT INTO rider_shifts')
    # what saved_route reads back: started/ended as EXTRACT(EPOCH ...) * 1000
    worker.db.route_row = (first[2], first[3], first[4], first[5] * 1000, first[6] * 1000)

    for i in range(11):
        worker.deliver(point(i + 40))  # 20 minutes later, further on
    worker.deliver(END)

    second = worker.db.executed('INSERT INTO rider_shifts')[1]
    assert second[5] == first[5]          # the route still starts at the first point
    assert second[6] == (T0 + 50 * 30_000) / 1000
    assert second[3] > first[3] * 1.9     # both parts of the ride
    assert second[4] == first[4] * 2


def test_an_old_route_row_without_times_is_not_continued(worker):
    worker.db.route_row = ('/old/route.gpx', 3.0, 10.0, None, None)  # rows written before started/ended_at
    for i in range(3):
        worker.deliver(point(i))
    worker.deliver(END)
    [row] = worker.db.executed('INSERT INTO rider_shifts')
    assert row[5] == T0 / 1000 and row[3] < 1


def test_a_route_refused_by_the_database_drops_its_gpx_and_completes(worker):
    """The rider deleted the account during the ride: retrying would loop forever."""
    worker.db.fail('INSERT INTO rider_shifts', psycopg.errors.ForeignKeyViolation('user does not exist'))
    for i in range(3):
        worker.deliver(point(i))
    tag = worker.deliver(END)

    assert worker.channel.acked[-1] == tag and worker.channel.timers == []
    assert list(worker.dir.glob('*.gpx')) == []  # no orphan file left on the disk
    assert tmp_points(worker) == []


def test_a_database_outage_at_the_end_keeps_the_points_for_the_retry(worker):
    worker.db.fail('INSERT INTO rider_shifts', psycopg.OperationalError('connection refused'))
    for i in range(3):
        worker.deliver(point(i))
    first = worker.deliver(END)

    assert first not in worker.channel.acked and len(worker.channel.timers) == 1
    assert len(tmp_points(worker)) == 3                # the route can still be written
    assert worker.cache.values['position:42']['ts'] == T0 + 60_000

    retry = worker.deliver(END)
    assert worker.channel.acked[-1] == retry
    assert len(worker.db.executed('INSERT INTO rider_shifts')) == 1
    assert tmp_points(worker) == []


def test_an_end_without_points_saves_nothing(worker):
    worker.cache.values['position:42'] = {'lat': 45.0}
    tag = worker.deliver(END)
    assert worker.channel.acked == [tag]
    assert worker.db.executed('INSERT INTO rider_shifts') == []
    assert 'position:42' not in worker.cache.values
