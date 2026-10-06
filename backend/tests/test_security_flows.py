from datetime import datetime, timezone

import pytest

from app.auth.models import FallEvent, RiderShift, User, user_datastore
from extensions import db


def _login(client, email):
    assert client.post("/api/auth/login", json={"identity": email, "password": "password"}).status_code == 200


def test_account_deletion_cascades_private_data(
    app, user_factory, monkeypatch, tmp_path
):
    app.config["GPX_STORAGE_DIR"] = str(tmp_path)
    gpx_path = tmp_path / "deleted-user.gpx"
    gpx_path.write_text("<gpx/>", encoding="utf-8")

    with app.app_context():
        user = user_factory("delete-me@example.com", "delete_me")
        db.session.commit()
        user_id = user.id
        db.session.add_all(
            [
                RiderShift(session_id="delete-session", user_id=user_id, gpx_path=str(gpx_path)),
                FallEvent(
                    session_id="delete-session",
                    user_id=user_id,
                    latitude=41.9,
                    longitude=12.5,
                    timestamp=datetime.now(timezone.utc),
                ),
            ]
        )
        db.session.commit()

    monkeypatch.setattr("extensions.redis_client.delete", lambda *_keys: 1)
    client = app.test_client()
    _login(client, "delete-me@example.com")
    response = client.post("/api/auth/delete-account", json={"password": "password"})
    assert response.status_code == 200

    with app.app_context():
        assert db.session.get(User, user_id) is None
        assert RiderShift.query.filter_by(user_id=user_id).count() == 0
        assert FallEvent.query.filter_by(user_id=user_id).count() == 0
    assert not gpx_path.exists()


@pytest.mark.parametrize("method, path", [
    ("get", "/login"), ("post", "/login"), ("get", "/register"), ("post", "/register"), ("get", "/logout"),
    ("get", "/auth/me"), ("post", "/auth/delete_account"), ("get", "/auth/sos/contacts"),
    ("get", "/groups/"), ("post", "/groups/join"), ("get", "/analytics/"), ("get", "/other/settings"),
    ("get", "/map/"), ("post", "/telemetry/activity"), ("get", "/telemetry/data/day"),
    ("post", "/trigger_sos"), ("get", "/download/gpx/1"), ("get", "/bike/013-001"),
])
def test_old_html_pages_are_gone(app, client, user_factory, method, path):
    """The old Flask pages were replaced by the React app: only the admin panel is left under /web/."""
    with app.app_context():
        user_factory("legacy@example.com", "legacy_rider")
        db.session.commit()
    _login(client, "legacy@example.com")
    assert getattr(client, method)(path).status_code == 404


def test_check_session_for_fastapi(client, user_factory):
    """FastAPI (/stream, /session/*) validates the session cookie on this internal endpoint."""
    anonymous = client.get("/auth/check_session")
    assert anonymous.status_code == 401
    assert anonymous.get_json() == {"authenticated": False}

    with client.application.app_context():
        user_factory("fastapi@example.com", "fastapi_rider")
        db.session.commit()
    _login(client, "fastapi@example.com")
    body = client.get("/auth/check_session").get_json()
    assert body["authenticated"] is True
    assert set(body) == {"user_id", "authenticated", "sensors_enabled", "share_location_with_groups"}


def test_admin_panel_without_session_goes_to_the_app_login(client):
    """Behind Nginx the panel lives under /web: the React login must bring the admin back there."""
    response = client.get("/admin/?status=delivered", headers={"X-Forwarded-Prefix": "/web"})
    assert response.status_code == 302
    assert response.headers["Location"] == "/accedi?next=%2Fweb%2Fadmin%2F%3Fstatus%3Ddelivered"
    # /web/ itself leads to the panel (and from there to the login)
    assert client.get("/", headers={"X-Forwarded-Prefix": "/web"}).headers["Location"] == "/web/admin/"


def test_admin_resets_a_forgotten_password(app, client, user_factory, monkeypatch):
    """`flask ror reset-password`: temporary password, old password and old sessions no longer work."""
    with app.app_context():
        user_factory("forgot@example.com", "forgot_rider")
        db.session.commit()
    _login(client, "forgot@example.com")
    lockout = {"login_failures:10.0.0.1:forgot@example.com": "10", "login_failures:10.0.0.1:someone@example.com": "3"}
    monkeypatch.setattr("extensions.redis_client.scan_iter", lambda match: [
        key for key in list(lockout) if key.startswith("login_failures:") and key.endswith(match.rsplit(":", 1)[1])
    ])
    monkeypatch.setattr("extensions.redis_client.delete", lambda *keys: [lockout.pop(k, None) for k in keys])

    result = app.test_cli_runner().invoke(args=["ror", "reset-password", "FORGOT@example.com"])
    assert result.exit_code == 0, result.output
    temporary = result.output.split("Temporary password for forgot@example.com: ")[1].split()[0]
    assert len(temporary) >= 12
    assert list(lockout) == ["login_failures:10.0.0.1:someone@example.com"]

    assert client.get("/api/auth/me").status_code == 401  # the phone that was logged in is logged out
    assert client.post("/api/auth/login", json={"identity": "forgot@example.com", "password": "password"}).status_code == 401
    assert client.post("/api/auth/login", json={"identity": "forgot@example.com", "password": temporary}).status_code == 200

    missing = app.test_cli_runner().invoke(args=["ror", "reset-password", "nobody@example.com"])
    assert missing.exit_code != 0 and "No user" in missing.output


def test_web_root_sends_riders_to_the_app(app, client, user_factory):
    with app.app_context():
        user_factory("rider@example.com", "plain_rider")
        boss = user_factory("boss@example.com", "boss")
        user_datastore.add_role_to_user(boss, "admin")
        db.session.commit()
    _login(client, "rider@example.com")
    assert client.get("/").headers["Location"] == "/"
    assert client.get("/admin/").status_code == 403

    client.post("/api/auth/logout")
    _login(client, "boss@example.com")
    assert client.get("/").headers["Location"] == "/admin/"
    assert client.get("/admin/").status_code == 200


HUGE = '99999999999999999999'  # beyond the database integer range


@pytest.mark.parametrize("method, path", [
    ('GET', f'/api/groups/{HUGE}'),
    ('GET', f'/api/routes/{HUGE}'),
    ('GET', f'/api/routes/{HUGE}/gpx'),
    ('DELETE', f'/api/routes/{HUGE}'),
    ('POST', f'/api/orders/{HUGE}/accept'),
    ('PATCH', f'/api/orders/{HUGE}/status'),
    ('POST', f'/api/sos/{HUGE}/resolve'),
    ('DELETE', f'/api/groups/{HUGE}/members/{HUGE}'),
    ('POST', f'/api/notifications/{HUGE}/read'),
    ('GET', f'/api/groups/{2**31}/messages'),
])
def test_huge_ids_in_the_url_are_not_found_instead_of_server_errors(client, user_factory, method, path):
    with client.application.app_context():
        user_factory('big@example.com', 'big_ids')
        db.session.commit()
    _login(client, 'big@example.com')
    response = client.open(path, method=method, json={'status': 'picked_up'})
    assert response.status_code in (404, 405)  # no route matches: a client error, never a database error
    assert response.get_json()['error'] in ('not_found', 'method_not_allowed')


def test_huge_ids_in_the_query_string_are_ignored(client, user_factory):
    with client.application.app_context():
        user_factory('bigq@example.com', 'big_query')
        db.session.commit()
    _login(client, 'bigq@example.com')
    for value in (HUGE, '²', '-1'):
        assert client.get(f'/api/notifications?after_id={value}').status_code == 200


def test_database_connections_are_checked_before_use():
    """After a restart of PostgreSQL alone the pooled connections are dead: each one is tested first."""
    from config import Config

    assert Config.SQLALCHEMY_ENGINE_OPTIONS.get('pool_pre_ping') is True


def test_nul_characters_are_removed_from_text(client, user_factory):
    """PostgreSQL refuses NUL in text: group names, chat, SOS contacts... answered 500."""
    with client.application.app_context():
        user_factory('text@example.com', 'text_nul')
        db.session.commit()
    _login(client, 'text@example.com')
    group = client.post('/api/groups', json={'name': 'Navi\x00gli', 'description': 'turno\x00'})
    assert group.status_code == 201
    assert (group.get_json()['name'], group.get_json()['description']) == ('Navigli', 'turno')
    message = client.post(f"/api/groups/{group.get_json()['id']}/messages", json={'text': 'ci\x00ao'})
    assert message.get_json()['message']['text'] == 'ciao'
    contact = client.post('/api/sos-contacts', json={'name': 'An\x00na', 'phone': '333 1234567', 'relationship': 'so\x00rella'})
    assert contact.status_code == 201 and contact.get_json()['name'] == 'Anna'
    assert client.post('/api/groups/join', json={'code': '\x00'}).status_code == 422


@pytest.mark.parametrize("query, status", [
    ('gh5=u0nd9', 200),
    ('gh5=u0nd9,u0ndd', 200),
    ('gh5=', 400),
    ('gh5=%00', 400),
    ("gh5=x'OR'1", 400),
    ('gh5=aaaaa', 400),  # not in the geohash alphabet
    ('gh5=' + ','.join(['u0nd9'] * 51), 400),
])
def test_map_points_validate_the_geohashes(client, query, status):
    assert client.get(f'/api/v1/fountains?{query}').status_code == status
