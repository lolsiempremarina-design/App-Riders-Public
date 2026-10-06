"""Route history API (phase 3): list, track, GPX download and deletion."""
from datetime import datetime

import pytest

from app.auth.models import RiderShift
from extensions import db

GPX = """<?xml version="1.0" encoding="UTF-8"?>
<gpx xmlns="http://www.topografix.com/GPX/1/1" version="1.1" creator="test">
  <trk><trkseg>
    <trkpt lat="45.4642" lon="9.19"><time>2026-09-24T09:00:00+00:00</time></trkpt>
    <trkpt lat="45.47" lon="9.2"><time>2026-09-24T09:30:00+00:00</time></trkpt>
  </trkseg></trk>
</gpx>
"""


@pytest.fixture
def storage(app, tmp_path):
    app.config['GPX_STORAGE_DIR'] = str(tmp_path)
    return tmp_path


@pytest.fixture
def my_routes(app, client, user_factory, storage, tmp_path_factory):
    with app.app_context():
        me = user_factory('routes@example.com', 'routes_user')
        other = user_factory('other-routes@example.com', 'other_routes')
        db.session.flush()
        gpx_path = storage / 'me_r1.gpx'
        gpx_path.write_text(GPX, encoding='utf-8')
        outside = tmp_path_factory.mktemp('outside') / 'secret.gpx'
        outside.write_text(GPX, encoding='utf-8')
        routes = [
            RiderShift(user_id=me.id, session_id='r1', gpx_path=str(gpx_path), total_distance_km=12,
                       duration_min=30, created_at=datetime(2026, 9, 24, 9, 30)),
            RiderShift(user_id=me.id, session_id='r2', gpx_path=str(storage / 'missing.gpx'),
                       total_distance_km=3, duration_min=15, created_at=datetime(2026, 9, 20, 18, 0)),
            RiderShift(user_id=me.id, session_id='r3', gpx_path=str(outside), total_distance_km=1,
                       duration_min=5, created_at=datetime(2026, 9, 10, 18, 0)),
            RiderShift(user_id=other.id, session_id='x1', gpx_path=str(gpx_path), total_distance_km=50,
                       duration_min=60, created_at=datetime(2026, 9, 24, 9, 30)),
        ]
        db.session.add_all(routes)
        db.session.commit()
        ids = {r.session_id: r.id for r in routes}
    assert client.post('/api/auth/login', json={'identity': 'routes@example.com', 'password': 'password'}).status_code == 200
    return ids


def test_routes_require_login(client):
    assert client.get('/api/routes').status_code == 401


def test_list_routes_newest_first_and_only_mine(my_routes, client):
    body = client.get('/api/routes').get_json()
    assert body['total'] == 3
    assert [r['session_id'] for r in body['routes']] == ['r1', 'r2', 'r3']
    first = body['routes'][0]
    # Stored UTC 09:30, Rome is UTC+2 in September; the ride lasted 30 min.
    assert first['ended_at'] == '2026-09-24T11:30:00'
    assert first['started_at'] == '2026-09-24T11:00:00'
    assert first['avg_speed_kmh'] == 24.0
    assert first['has_gpx'] is True
    assert body['routes'][1]['has_gpx'] is False  # file missing
    assert body['routes'][2]['has_gpx'] is False  # outside the storage directory

    page = client.get('/api/routes?limit=1&offset=1').get_json()
    assert [r['session_id'] for r in page['routes']] == ['r2']


def test_route_detail_returns_track_points(my_routes, client):
    body = client.get(f"/api/routes/{my_routes['r1']}").get_json()
    assert body['points'] == [
        [45.4642, 9.19, '2026-09-24T09:00:00+00:00'],
        [45.47, 9.2, '2026-09-24T09:30:00+00:00'],
    ]
    assert client.get(f"/api/routes/{my_routes['r2']}").get_json()['points'] == []


def test_other_users_routes_are_not_found(my_routes, client):
    assert client.get(f"/api/routes/{my_routes['x1']}").status_code == 404
    assert client.get(f"/api/routes/{my_routes['x1']}/gpx").status_code == 404
    assert client.delete(f"/api/routes/{my_routes['x1']}").status_code == 404


def test_gpx_download(my_routes, client):
    response = client.get(f"/api/routes/{my_routes['r1']}/gpx")
    assert response.status_code == 200
    assert response.mimetype == 'application/gpx+xml'
    assert 'attachment' in response.headers['Content-Disposition']
    assert 'ror-percorso-2026-09-24_11-00.gpx' in response.headers['Content-Disposition']
    assert b'<trkpt lat="45.4642"' in response.data
    response.close()

    missing = client.get(f"/api/routes/{my_routes['r3']}/gpx")
    assert missing.status_code == 404  # outside storage: never served


def test_delete_route_removes_file(my_routes, client, storage):
    assert client.delete(f"/api/routes/{my_routes['r1']}").get_json() == {'success': True, 'id': my_routes['r1']}
    assert not (storage / 'me_r1.gpx').exists()
    assert client.get('/api/routes').get_json()['total'] == 2


def test_real_start_time_is_used_when_recorded(app, client, user_factory, storage):
    with app.app_context():
        user = user_factory('start@example.com', 'start_user')
        db.session.flush()
        # 20 min of riding with a 30 min pause: closing time - duration would be wrong
        db.session.add(RiderShift(user_id=user.id, session_id='p1', gpx_path='', total_distance_km=6,
                                  duration_min=20, started_at=datetime(2026, 9, 24, 8, 0),
                                  ended_at=datetime(2026, 9, 24, 8, 50),
                                  created_at=datetime(2026, 9, 24, 9, 0)))
        db.session.commit()
    client.post('/api/auth/login', json={'identity': 'start@example.com', 'password': 'password'})
    route = client.get('/api/routes').get_json()['routes'][0]
    assert route['started_at'] == '2026-09-24T10:00:00'
    assert route['ended_at'] == '2026-09-24T10:50:00'  # last GPS point, not when the worker closed it
    assert route['avg_speed_kmh'] == 18.0
