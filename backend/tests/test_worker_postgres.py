"""The SQL of the GPS worker against the real schema: PostgreSQL after `flask db upgrade`.

The worker writes rider_shifts and fall_events with its own SQL (psycopg, not the ORM of the web app): a
migration that renamed or changed one of those columns would break the saving of every route while all the
other tests pass. These tests run when ROR_WORKER_TEST_DATABASE_URI points to a migrated database (the CI
sets it after the migrations, on its throwaway PostgreSQL) and are skipped otherwise. They delete what they
create.
"""
import os
import uuid
from datetime import date, datetime, timezone
from types import SimpleNamespace

import psycopg
import pytest
from sqlalchemy import text
from sqlalchemy.engine import make_url

from app import create_app
from app.api.stats import load_rides
from app.auth.models import Bike, FallEvent, RiderShift, user_datastore
from config import Config, engine_options
from extensions import db

PG_URI = os.getenv('ROR_WORKER_TEST_DATABASE_URI', '')
pytestmark = pytest.mark.skipif(not PG_URI, reason='needs ROR_WORKER_TEST_DATABASE_URI (PostgreSQL after flask db upgrade)')

T0 = 1_790_000_000_000  # ms


class PostgresConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = PG_URI
    SQLALCHEMY_ENGINE_OPTIONS = engine_options(PG_URI)
    SECURITY_PASSWORD_HASH = 'plaintext'
    FCM_SERVICE_ACCOUNT_FILE = ''
    MAIL_SERVER = ''
    MAIL_USERNAME = ''
    MAIL_PASSWORD = ''


def utc_naive(ms):
    return datetime.fromtimestamp(ms / 1000, timezone.utc).replace(tzinfo=None)


@pytest.fixture
def rider(consumer, monkeypatch):
    """A rider with a linked bike in the migrated database; the worker connects to the same database."""
    url = make_url(PG_URI)
    for name, value in (('DB_HOST', url.host), ('DB_PORT', url.port or 5432), ('DB_NAME', url.database),
                        ('DB_USER', url.username), ('DB_PASSWORD', url.password)):
        monkeypatch.setattr(consumer, name, value)

    app = create_app(PostgresConfig)
    suffix = uuid.uuid4().hex[:10]
    with app.app_context():
        user = user_datastore.create_user(
            email=f'worker_{suffix}@example.com', username=f'worker_{suffix}', password='password',
            tax_id_code=f'WRK{suffix.upper()}XXX', full_name='Worker Test', date_of_birth=date(1990, 1, 1),
            gender='M', birth_city_country='Roma')
        db.session.flush()
        bike = Bike(user_id=user.id, label='Worker test')
        db.session.add(bike)
        db.session.commit()
        created = SimpleNamespace(app=app, user_id=user.id, bike_id=bike.id, session=str(uuid.uuid4()))
    yield created

    with app.app_context():
        for sql in ('DELETE FROM fall_events WHERE user_id = :user', 'DELETE FROM rider_shifts WHERE user_id = :user',
                    'DELETE FROM bikes WHERE user_id = :user', 'DELETE FROM "user" WHERE id = :user'):
            db.session.execute(text(sql), {'user': created.user_id})
        db.session.commit()
        db.engine.dispose()


def test_routes_and_falls_written_by_the_worker_are_what_the_web_app_reads(consumer, rider, tmp_path):
    from stream_manager import SessionSummary

    user = str(rider.user_id)
    summary = SessionSummary(str(tmp_path / 'route.gpx'), 12.345, 41.5, T0 + 123, T0 + 50 * 60_000)
    consumer.save_shift_metadata(rider.session, user, summary)
    assert consumer.saved_route(rider.session, user) == summary  # what a resumed session continues from

    # the session resumed and ended again: the same row is updated, not a second route
    longer = summary._replace(distance_km=15.5, duration_min=55.25, ended_ms=T0 + 70 * 60_000)
    consumer.save_shift_metadata(rider.session, user, longer)
    assert consumer.saved_route(rider.session, user) == longer

    consumer.save_fall_event(rider.session, user, 45.1, 9.2, T0 + 600_000)
    consumer.save_fall_event(rider.session, user, 45.1, 9.2, T0 + 600_000)  # the same point delivered twice

    with rider.app.app_context():
        [shift] = RiderShift.query.filter_by(user_id=rider.user_id).all()
        assert (shift.session_id, shift.gpx_path) == (rider.session, summary.gpx_path)
        assert (shift.total_distance_km, shift.duration_min) == (15.5, 55.25)
        assert shift.started_at == utc_naive(T0 + 123)  # naive UTC like the ORM writes
        assert shift.ended_at == utc_naive(T0 + 70 * 60_000)
        assert shift.bike_id == rider.bike_id           # credited to the bike linked by the rider
        assert shift.created_at is not None             # default of the database: the worker does not set it

        [fall] = FallEvent.query.filter_by(user_id=rider.user_id).all()
        assert (fall.latitude, fall.longitude, fall.timestamp) == (45.1, 9.2, utc_naive(T0 + 600_000))

        [ride] = load_rides(rider.user_id)  # the statistics of the rider
        assert ride.distance_km == 15.5


def test_the_route_of_a_deleted_account_is_an_integrity_error(consumer, rider, tmp_path):
    """on_message drops the GPX of such a route instead of retrying it forever: it relies on this error."""
    from stream_manager import SessionSummary

    summary = SessionSummary(str(tmp_path / 'orphan.gpx'), 1.0, 5.0, T0, T0 + 300_000)
    with pytest.raises(psycopg.errors.IntegrityError):
        consumer.save_shift_metadata(rider.session, '2147483000', summary)
