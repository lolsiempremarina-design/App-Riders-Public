"""GPS worker: distance, moving time, start of a closed session and proof of life."""
import importlib.util
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'gps_worker'))

import heartbeat  # noqa: E402
import retry  # noqa: E402
from stream_manager import GPXStreamManager, summarize_track  # noqa: E402

T0 = 1_790_000_000_000  # ms
BACKFILL_MIGRATION = (Path(__file__).resolve().parents[1] / 'migrations' / 'versions'
                      / 'c3f8a1d6e2b9_route_end_time_drop_activities.py')


def _straight(n, start_ms, step_ms, lat0=45.0):
    # ~111 m per 0.001° of latitude
    return [(lat0 + i * 0.001, 9.0, None, start_ms + i * step_ms) for i in range(n)]


def test_summarize_excludes_pauses():
    moving = _straight(11, T0, 30_000)                         # 5 min, ~1.11 km
    after_pause = _straight(11, T0 + 20 * 60_000, 30_000, lat0=45.02)  # 15 min later, far away
    distance, minutes = summarize_track(moving + after_pause, pause_gap_sec=120)
    assert round(minutes, 2) == 10.0
    assert 2.1 < distance < 2.3  # the jump across the pause is not counted


def _wobble(n, start_ms, step_ms, lat=45.0, lon=9.0, metres=5, seed=1):
    """A still phone: every fix up to ``metres`` north/south and east/west of the same place (deterministic)."""
    import random
    rng = random.Random(seed)
    deg = metres / 111_000
    return [(lat + rng.uniform(-deg, deg), lon + rng.uniform(-deg, deg) * 1.41, None, start_ms + i * step_ms)
            for i in range(n)]


def test_a_still_phone_adds_no_distance_and_no_moving_time():
    """Before, the wobble of the GPS of a rider standing still was added: 70 m in a minute and a half."""
    from stream_manager import _haversine_km
    still = _wobble(300, T0, 1_000)  # 5 minutes still, one fix per second
    old_sum_km = sum(_haversine_km(a[0], a[1], b[0], b[1]) for a, b in zip(still, still[1:]))
    assert old_sum_km > 1  # what the sum of every step counted
    assert summarize_track(still) == (0.0, 0.0)


def test_stops_do_not_count_as_moving_time_and_movement_is_not_lost():
    ride = _straight(6, T0, 30_000)                                   # 2.5 min, ~0.56 km
    # 2 minutes at a traffic light: the app sends a point every 15 s at the same place
    stop = [(ride[-1][0], 9.0, None, ride[-1][3] + i * 15_000) for i in range(1, 9)]
    after = _straight(6, stop[-1][3] + 15_000, 30_000, lat0=ride[-1][0] + 0.001)
    distance, minutes = summarize_track(ride + stop + after)
    assert abs(distance - 11 * 0.1112) < 0.01                  # all the real distance, the restart included
    assert abs(minutes - (5 * 30 + 15 + 5 * 30) / 60) < 1e-9   # 5.25 min: the 2 minutes still are left out


def test_walking_the_bike_slowly_still_counts():
    # 4 km/h: the app sends a point every 15 m (13.5 s)
    step_deg = 15 / 111_000
    walk = [(45.0 + i * step_deg, 9.0, None, T0 + i * 13_500) for i in range(23)]  # ~330 m in ~5 min
    distance, minutes = summarize_track(walk)
    assert abs(distance - 0.330) < 0.002 and abs(minutes - 22 * 13.5 / 60) < 1e-9
    # positions every 2 s (2.2 m each, alone below the minimum): the distance is not lost either
    raw = [(45.0 + i * (2.2 / 111_000), 9.0, None, T0 + i * 2_000) for i in range(151)]
    assert 0.32 < summarize_track(raw)[0] <= 0.334


def test_impossible_jumps_do_not_count(tmp_path):
    """A glitch (or a forged point) 10 km away in 2 seconds would add km to the score and the bike stats."""
    track = _straight(6, T0, 30_000)  # ~0.56 km in 2.5 min
    glitch = (track[-1][0] + 0.09, 9.0, None, track[-1][3] + 2_000)  # ~10 km in 2 s
    back = (track[-1][0] + 0.001, 9.0, None, track[-1][3] + 32_000)  # where the rider really was
    honest_km, honest_min = summarize_track(track)
    distance, minutes = summarize_track(track + [glitch, back])
    assert distance - honest_km < 0.12 and minutes <= honest_min + 0.6


def test_close_session_measures_full_track_and_real_start(tmp_path):
    manager = GPXStreamManager(str(tmp_path), pause_gap_sec=120)
    # a curved path: RDP would shorten it, distance must come from the full track
    points = [(45.0 + 0.001 * i, 9.0 + (0.001 if i % 2 else 0), None, T0 + i * 20_000) for i in range(12)]
    for lat, lon, _e, ts in reversed(points):  # out of order on purpose
        manager.add_point('s1', '7', lat, lon, None, ts)
    summary = manager.close_session('s1', '7', apply_rdp=True, epsilon=0.01)

    expected_distance, expected_minutes = summarize_track(points)
    assert abs(summary.distance_km - expected_distance) < 1e-9
    assert summary.duration_min == expected_minutes == 11 * 20 / 60
    assert summary.started_ms == T0
    assert summary.ended_ms == T0 + 11 * 20_000
    gpx = Path(summary.gpx_path).read_text(encoding='utf-8')
    assert gpx.count('<trkpt') < 12  # simplified file, full-precision stats


def test_points_survive_a_worker_restart(tmp_path):
    """A point is acknowledged to RabbitMQ right after add_point: it must already be on disk."""
    before_restart = GPXStreamManager(str(tmp_path), pause_gap_sec=120)
    points = _straight(10, T0, 10_000)
    for lat, lon, _e, ts in points:
        before_restart.add_point('s4', '7', lat, lon, None, ts)

    after_restart = GPXStreamManager(str(tmp_path), pause_gap_sec=120)  # RAM state lost
    after_restart.add_point('s4', '7', *points[-1][:2], None, points[-1][3])  # a retried batch: no duplicate
    summary = after_restart.close_session('s4', '7', apply_rdp=False)

    assert summary is not None
    assert (summary.started_ms, summary.ended_ms) == (T0, T0 + 9 * 10_000)
    assert Path(summary.gpx_path).read_text(encoding='utf-8').count('<trkpt') == 10


def test_a_session_resumed_after_its_end_continues_the_saved_route(tmp_path):
    """The server closed the route but the app did not get the answer, and the rider pressed "Riprendi":
    the same session goes on. Before, its next end replaced the route with the points after the pause."""
    manager = GPXStreamManager(str(tmp_path), pause_gap_sec=120)
    first = _straight(11, T0, 30_000)                                # 5 min
    for lat, lon, _e, ts in first:
        manager.add_point('s6', '7', lat, lon, None, ts)
    saved = manager.close_session('s6', '7', apply_rdp=False)
    assert manager.close_session('s6', '7', apply_rdp=False, previous=saved) == saved  # the same end twice
    manager.complete_session('s6', '7')

    second = _straight(11, T0 + 20 * 60_000, 30_000, lat0=45.02)     # resumed 10 min after the end
    for lat, lon, _e, ts in second:
        manager.add_point('s6', '7', lat, lon, None, ts)
    merged = manager.close_session('s6', '7', apply_rdp=False, previous=saved)

    distance, minutes = summarize_track(first + second, pause_gap_sec=120)
    assert abs(merged.distance_km - distance) < 1e-9 and abs(merged.duration_min - minutes) < 1e-9
    assert (merged.started_ms, merged.ended_ms) == (T0, second[-1][3])
    assert Path(merged.gpx_path).read_text(encoding='utf-8').count('<trkpt') == 22

    # the end delivered again before the points were deleted: with the route saved nothing is added twice,
    # with the route not saved yet the same route is written again
    assert manager.close_session('s6', '7', apply_rdp=False, previous=merged) == merged
    assert manager.close_session('s6', '7', apply_rdp=False, previous=saved) == merged
    assert Path(merged.gpx_path).read_text(encoding='utf-8').count('<trkpt') == 22


def test_points_with_impossible_times_are_discarded(tmp_path):
    """A forged or broken timestamp must not block the session: before, the GPX export failed at every retry."""
    manager = GPXStreamManager(str(tmp_path), pause_gap_sec=120)
    points = _straight(6, T0, 10_000)
    for lat, lon, _e, ts in points:
        manager.add_point('s5', '7', lat, lon, None, ts)
    for bad in (1e20, float('inf'), float('nan'), 1e15, -5, 0):
        manager.add_point('s5', '7', 45.0, 9.0, None, bad)
    manager.add_point('s5', '7', float('nan'), 9.0, None, T0 + 1)
    # a line left on disk by an older worker, before the check existed
    with open(tmp_path / '7_s5.gpx.tmp', 'a', encoding='utf-8') as fh:
        fh.write(f'45.0,9.0,,{1e20}\n')

    summary = manager.close_session('s5', '7', apply_rdp=False)
    assert summary is not None
    assert (summary.started_ms, summary.ended_ms) == (T0, T0 + 5 * 10_000)
    assert Path(summary.gpx_path).read_text(encoding='utf-8').count('<trkpt') == 6


def test_route_end_backfill_reads_the_last_point_of_the_worker_gpx(tmp_path):
    """Migration c3f8a1d6e2b9 fills rider_shifts.ended_at of older routes from their GPX file."""
    spec = importlib.util.spec_from_file_location('route_end_migration', BACKFILL_MIGRATION)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)

    manager = GPXStreamManager(str(tmp_path), pause_gap_sec=120)
    for lat, lon, _e, ts in _straight(20, T0, 15_000):
        manager.add_point('s3', '7', lat, lon, None, ts)
    summary = manager.close_session('s3', '7', apply_rdp=True)  # a straight line: RDP keeps 2 points

    expected = datetime.fromtimestamp(summary.ended_ms / 1000, tz=timezone.utc).replace(tzinfo=None)
    assert migration._last_point_time(summary.gpx_path) == expected
    assert migration._last_point_time(str(tmp_path / 'missing.gpx')) is None


def test_close_session_without_points(tmp_path):
    manager = GPXStreamManager(str(tmp_path))
    manager.add_point('s2', '7', None, None, None, T0)
    assert manager.close_session('s2', '7') is None


def test_heartbeat_is_written_and_its_age_read_back(tmp_path):
    alive = str(tmp_path / 'alive')
    assert heartbeat.heartbeat_age(path=alive) is None     # not written yet: the worker is starting
    heartbeat.touch_heartbeat(path=alive)
    assert 0 <= heartbeat.heartbeat_age(path=alive) < 5


def test_watchdog_quits_only_when_the_worker_stopped_making_progress():
    """A worker stuck in on_message keeps its process alive: only a stale heartbeat reveals it."""
    assert heartbeat.watchdog_should_quit(None, timeout=180) is False    # still starting up
    assert heartbeat.watchdog_should_quit(30.0, timeout=180) is False    # normal: every 30 s
    assert heartbeat.watchdog_should_quit(179.0, timeout=180) is False
    assert heartbeat.watchdog_should_quit(181.0, timeout=180) is True    # beats missed


def test_a_worker_stuck_since_ten_minutes_is_told_to_quit(tmp_path):
    alive = str(tmp_path / 'alive')
    heartbeat.touch_heartbeat(path=alive)
    age = heartbeat.heartbeat_age(now=time.time() + 600, path=alive)
    assert heartbeat.watchdog_should_quit(age, timeout=180) is True


def test_a_transient_failure_waits_longer_each_time_instead_of_looping():
    """Before, a message that failed (PostgreSQL restarting) went back at once: thousands of retries a minute."""
    assert [retry.transient_retry_delay(n) for n in range(1, 8)] == [1, 2, 4, 8, 16, 30, 30]
    assert retry.transient_retry_delay(0) == 1
    assert retry.transient_retry_delay(10**6) == 30  # half an hour of outage: no float overflow


def test_a_session_that_never_ends_is_forgotten_after_a_day(tmp_path):
    """Logout or app uninstalled during a ride: the session never gets its end. Before, its timestamps stayed in the
    worker's memory until a restart (weeks, on the PC used as a server)."""
    import stream_manager

    now = [0.0]
    manager = GPXStreamManager(str(tmp_path), pause_gap_sec=120, clock=lambda: now[0])
    for lat, lon, _e, ts in _straight(5, T0, 10_000):
        manager.add_point('abandoned', '7', lat, lon, None, ts)
    now[0] = stream_manager.SEEN_IDLE_SEC - 60
    manager.add_point('active', '8', 45.0, 9.0, None, T0)
    assert manager.tracked_sessions() == 2  # less than a day without points: both kept

    now[0] = stream_manager.SEEN_IDLE_SEC + stream_manager.SEEN_PRUNE_EVERY_SEC
    manager.add_point('active', '8', 45.001, 9.0, None, T0 + 10_000)
    assert manager.tracked_sessions() == 1  # the abandoned one is gone, the one still sending points is not

    # a late point of the forgotten session is still recorded, and its route closes with every point once
    manager.add_point('abandoned', '7', *_straight(5, T0, 10_000)[-1][:2], None, T0 + 4 * 10_000)
    summary = manager.close_session('abandoned', '7', apply_rdp=False)
    assert Path(summary.gpx_path).read_text(encoding='utf-8').count('<trkpt') == 5
