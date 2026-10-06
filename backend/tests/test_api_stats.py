"""Statistics API (phase 3): real rides grouped by the rider's local calendar."""
from datetime import date, datetime, timedelta

import pytest

from app.api import stats as stats_module
from app.auth.models import RiderShift
from extensions import db

TODAY = date(2026, 9, 24)  # Thursday


def _login(app, client, user_factory, email='stats@example.com', username='stats_user'):
    with app.app_context():
        user = user_factory(email, username)
        db.session.commit()
        user_id = user.id
    assert client.post('/api/auth/login', json={'identity': email, 'password': 'password'}).status_code == 200
    return user_id


def _route(user_id, session_id, start_utc, km, moving_min, elapsed_min):
    """A GPS route as the worker writes it: first/last point and moving time (pauses excluded)."""
    end_utc = start_utc + timedelta(minutes=elapsed_min)
    return RiderShift(user_id=user_id, session_id=session_id, gpx_path='', total_distance_km=km,
                      duration_min=moving_min, started_at=start_utc, ended_at=end_utc,
                      created_at=end_utc + timedelta(seconds=5))


@pytest.fixture(autouse=True)
def fixed_today(monkeypatch):
    monkeypatch.setattr(stats_module, 'local_today', lambda: TODAY)


@pytest.fixture
def rides(app, client, user_factory):
    user_id = _login(app, client, user_factory)
    with app.app_context():
        other = user_factory('someone@example.com', 'someone_else')
        db.session.flush()
        db.session.add_all([
            # 22:30 UTC on the 23rd is 00:30 of the 24th in Rome (UTC+2): must count as "today".
            # 40 min from the first to the last point, 30 of them moving: 10 min of pauses.
            _route(user_id, 'r1', datetime(2026, 9, 23, 22, 30), 10, 30, 40),
            _route(user_id, 'r3', datetime(2026, 9, 20, 7, 0), 6, 30, 30),
            _route(user_id, 'r4', datetime(2025, 3, 2, 9, 0), 30, 60, 60),
            # Older route without first/last point: closed at 10:00 UTC after 60 min -> started
            # 11:00 Rome time on the 24th; its pauses are unknown, not zero.
            RiderShift(user_id=user_id, session_id='r2', gpx_path='', total_distance_km=15,
                       duration_min=60, created_at=datetime(2026, 9, 24, 10, 0)),
            RiderShift(user_id=other.id, session_id='x', gpx_path='', total_distance_km=99,
                       duration_min=60, created_at=datetime(2026, 9, 24, 10, 0)),
        ])
        db.session.commit()
    return user_id


def test_stats_require_login(client):
    assert client.get('/api/stats/overview').status_code == 401
    assert client.get('/api/stats/period?period=week').status_code == 401


def test_invalid_period(rides, client):
    response = client.get('/api/stats/period?period=decade')
    assert response.status_code == 400
    assert response.get_json()['error'] == 'bad_request'


def test_week_buckets_use_local_days_and_only_my_rides(rides, client):
    body = client.get('/api/stats/period?period=week').get_json()
    assert body['timezone'] == 'Europe/Rome'
    assert [b['key'] for b in body['buckets']] == [
        '2026-09-18', '2026-09-19', '2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24']

    today = body['buckets'][-1]
    assert today['summary']['count'] == 2
    assert today['summary']['distance_km'] == 25
    assert today['summary']['duration_sec'] == 1800 + 3600
    assert today['summary']['avg_speed_kmh'] == round(25 / 1.5, 2)
    assert today['summary']['best_speed_kmh'] == 20.0
    # Pauses come from the route with first and last point; the older route is counted apart.
    assert today['summary']['pause_sec'] == 600
    assert today['summary']['pause_unknown_count'] == 1
    assert [p['key'] for p in today['series']] == ['00:00', '11:00']

    assert body['buckets'][-2]['summary']['count'] == 0  # the 23rd (UTC) belongs to the 24th locally
    assert body['buckets'][2]['summary']['distance_km'] == 6
    assert body['summary']['count'] == 3
    assert body['summary']['distance_km'] == 31


def test_month_year_and_always(rides, client):
    month = client.get('/api/stats/period?period=month').get_json()
    assert [b['key'] for b in month['buckets']] == ['2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09']
    september = month['buckets'][-1]
    assert september['summary']['count'] == 3
    assert [p['key'] for p in september['series']] == ['2026-09-20', '2026-09-24']

    year = client.get('/api/stats/period?period=year').get_json()
    assert [b['key'] for b in year['buckets']] == ['2025', '2026']
    assert year['buckets'][0]['summary']['distance_km'] == 30
    assert [p['key'] for p in year['buckets'][1]['series']] == ['2026-09']

    always = client.get('/api/stats/period?period=always').get_json()
    assert len(always['buckets']) == 1
    assert always['buckets'][0]['start'] == '2025-03-02'
    assert always['summary']['count'] == 4
    assert always['summary']['distance_km'] == 61


def test_overview(rides, client):
    body = client.get('/api/stats/overview').get_json()
    assert body['today'] == '2026-09-24'
    assert len(body['days']) == 7
    assert body['days'][-1]['date'] == '2026-09-24'
    assert body['days'][-1]['distance_km'] == 25
    assert body['week']['count'] == 3
    assert body['all_time']['count'] == 4


def test_empty_user_gets_zeroes_not_invented_data(app, client, user_factory):
    _login(app, client, user_factory, 'empty@example.com', 'empty_user')
    body = client.get('/api/stats/period?period=year').get_json()
    assert [b['key'] for b in body['buckets']] == ['2026']
    assert body['summary'] == {
        'count': 0, 'distance_km': 0, 'duration_sec': 0, 'avg_speed_kmh': 0.0,
        'best_speed_kmh': 0.0, 'pause_sec': 0, 'pause_unknown_count': 0,
    }
    assert body['buckets'][0]['series'] == []


def test_pauses_of_a_route_never_go_negative(app):
    """Rounding of the moving time must not produce negative pauses."""
    start = datetime(2026, 9, 24, 8, 0)
    shift = RiderShift(duration_min=20.004, started_at=start, ended_at=start + timedelta(minutes=20))
    assert stats_module.route_pause_sec(shift) == 0
    assert stats_module.route_pause_sec(RiderShift(duration_min=20, started_at=start)) is None
