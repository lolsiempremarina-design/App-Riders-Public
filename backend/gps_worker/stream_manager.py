"""Append-only GPS point streaming management and final .gpx file production."""
import logging
import math
import os
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from typing import NamedTuple

from rdp_optimizer import ramer_douglas_peucker

logger = logging.getLogger(__name__)

Point = tuple[float, float, float | None, float]  # lat, lon, elev, timestamp_ms

# Gaps longer than this between consecutive points are pauses (session paused in the
# app, or no fix while standing still): they do not count as ride time or distance.
DEFAULT_PAUSE_GAP_SEC = 120.0
# Same limit as the app (MAX_PLAUSIBLE_SPEED_KMH in src/tracking/geo.js): faster steps are GPS glitches.
MAX_SEGMENT_SPEED_KMH = 90.0
# Standing still the GPS position "dances" by a few metres: a step counts as movement only beyond MIN_MOVE_M
# from the last position counted and at least at MIN_MOVING_SPEED_KMH (slower is the drift of the fix).
# Same rule as the app (src/tracking/geo.js), which sends only the positions that pass it (with a larger
# distance when the fix is less precise) and, standing still, one point every 15 s at the same place.
MIN_MOVE_M = 15.0
MIN_MOVING_SPEED_KMH = 2.0

# Points outside these dates are discarded (wrong clock or forged request): a timestamp that cannot
# become a date made the GPX export fail at every retry, and the session end looped forever.
MIN_TIMESTAMP_MS = 946_684_800_000    # 2000-01-01
MAX_TIMESTAMP_MS = 4_102_444_800_000  # 2100-01-01

# The timestamps already written are kept in memory to skip the points of a batch sent again. A session that never
# ends (logout or app uninstalled during a ride) kept them until the worker restarted, and on the PC used as a server
# that can be weeks: they are forgotten after a day without points. A point of that session arriving later can be
# written twice at most, and the file is de-duplicated anyway when the session closes (_read_points).
SEEN_IDLE_SEC = 24 * 3600
SEEN_PRUNE_EVERY_SEC = 3600


def _finite(value) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def valid_timestamp(timestamp) -> bool:
    """A time in ms between 2000 and 2100."""
    return _finite(timestamp) and MIN_TIMESTAMP_MS <= timestamp <= MAX_TIMESTAMP_MS


def valid_point(lat, lon, timestamp) -> bool:
    """Finite coordinates on the globe and a valid timestamp."""
    return _finite(lat) and _finite(lon) and -90 <= lat <= 90 and -180 <= lon <= 180 and valid_timestamp(timestamp)


class SessionSummary(NamedTuple):
    gpx_path: str
    distance_km: float
    duration_min: float  # moving time, pauses excluded
    started_ms: float
    ended_ms: float


def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def _iso_from_epoch_ms(ts_ms: float) -> str:
    return datetime.fromtimestamp(ts_ms / 1000.0, tz=timezone.utc).isoformat()


def summarize_track(points: list[Point], pause_gap_sec: float = DEFAULT_PAUSE_GAP_SEC) -> tuple[float, float]:
    """Distance (km) and moving duration (min) of a full, time-ordered track.

    Steps are measured from the last position counted (the anchor). A step faster than MAX_SEGMENT_SPEED_KMH
    is a GPS glitch (or a forged point) and is skipped. A step shorter than MIN_MOVE_M or slower than
    MIN_MOVING_SPEED_KMH is the rider standing still: neither distance nor moving time. Before, every wobble
    of a still phone was added (70 m in a minute and a half, at a traffic light or waiting for an order) and
    stops counted as moving time. The app applies the same rules, the server again because km make the score
    and the bike stats.
    """
    distance_km = 0.0
    moving_ms = 0.0
    if not points:
        return distance_km, moving_ms
    anchor_lat, anchor_lon, _e, previous_ms = points[0]
    for lat, lon, _e, ts in points[1:]:
        gap_ms = ts - previous_ms
        if gap_ms <= 0:
            continue
        previous_ms = ts
        if gap_ms > pause_gap_sec * 1000:
            # pause: neither its time nor the jump between the two fixes counts
            anchor_lat, anchor_lon = lat, lon
            continue
        step_km = _haversine_km(anchor_lat, anchor_lon, lat, lon)
        speed_kmh = step_km / (gap_ms / 3_600_000)
        if speed_kmh > MAX_SEGMENT_SPEED_KMH:
            continue  # glitch: the anchor stays where the rider really was
        if step_km * 1000 < MIN_MOVE_M or speed_kmh < MIN_MOVING_SPEED_KMH:
            continue  # standing still
        distance_km += step_km
        moving_ms += gap_ms
        anchor_lat, anchor_lon = lat, lon
    return distance_km, moving_ms / 60000.0


class GPXStreamManager:
    """Append-only file per session, with RDP-compressed .gpx export on close.

    Every point is written to disk before ``add_point`` returns: the consumer acknowledges the
    RabbitMQ message right after, so a point kept only in RAM would be lost if the worker
    restarted (PC reboot, Docker update) before the session ends.
    """

    def __init__(self, output_base_dir: str, pause_gap_sec: float = DEFAULT_PAUSE_GAP_SEC,
                 clock=time.monotonic) -> None:
        self.output_base_dir = output_base_dir
        self.pause_gap_sec = pause_gap_sec
        os.makedirs(self.output_base_dir, exist_ok=True)
        self._seen_timestamps: dict[tuple[str, str], set[float]] = {}
        self._last_point_at: dict[tuple[str, str], float] = {}
        self._clock = clock
        self._next_prune = clock() + SEEN_PRUNE_EVERY_SEC

    def _forget_idle_sessions(self, now: float) -> None:
        """Drop the in-memory state of the sessions without points for SEEN_IDLE_SEC (checked once an hour)."""
        if now < self._next_prune:
            return
        self._next_prune = now + SEEN_PRUNE_EVERY_SEC
        for key in [k for k, last in self._last_point_at.items() if now - last > SEEN_IDLE_SEC]:
            self._last_point_at.pop(key, None)
            self._seen_timestamps.pop(key, None)

    def tracked_sessions(self) -> int:
        """Sessions whose timestamps are kept in memory."""
        return len(self._seen_timestamps)

    def _tmp_path(self, user_id: str, session_id: str) -> str:
        return os.path.join(self.output_base_dir, f"{user_id}_{session_id}.gpx.tmp")

    def _final_path(self, user_id: str, session_id: str) -> str:
        return os.path.join(self.output_base_dir, f"{user_id}_{session_id}.gpx")

    def add_point(
        self,
        session_id: str,
        user_id: str,
        lat: float | None,
        lon: float | None,
        elev: float | None,
        timestamp: float,
    ) -> None:
        # Discard points without a valid GPS fix (null lat/lon, e.g. first samples
        # before watchPosition returns the first position): a None value
        # written to disk would break parsing in _read_points.
        if lat is None or lon is None:
            logger.debug(
                "Point discarded due to missing coordinates (user=%s session=%s)", user_id, session_id
            )
            return
        if not valid_point(lat, lon, timestamp):
            logger.warning("Point discarded: invalid coordinates or time (user=%s session=%s timestamp=%r)",
                           user_id, session_id, timestamp)
            return

        now = self._clock()
        self._forget_idle_sessions(now)
        key = (user_id, session_id)
        self._last_point_at[key] = now
        seen = self._seen_timestamps.setdefault(key, set())
        if timestamp in seen:
            logger.debug(
                "Duplicate point discarded (user=%s session=%s timestamp=%s)",
                user_id,
                session_id,
                timestamp,
            )
            return
        with open(self._tmp_path(user_id, session_id), "a", encoding="utf-8") as fh:
            fh.write(f"{lat},{lon},{'' if elev is None else elev},{timestamp}\n")
        seen.add(timestamp)  # only once it is on disk: a failed write is retried with the message

    def _read_points(self, user_id: str, session_id: str) -> list[Point]:
        tmp_path = self._tmp_path(user_id, session_id)
        points: list[Point] = []
        seen_timestamps: set[float] = set()
        if not os.path.exists(tmp_path):
            return points
        with open(tmp_path, "r", encoding="utf-8") as fh:
            for line_no, line in enumerate(fh, start=1):
                line = line.strip()
                if not line:
                    continue
                try:
                    lat_s, lon_s, elev_s, ts_s = line.split(",")
                    lat, lon, timestamp = float(lat_s), float(lon_s), float(ts_s)
                    if not valid_point(lat, lon, timestamp):
                        raise ValueError("invalid coordinates or time")  # written by an older worker
                    if timestamp in seen_timestamps:
                        continue
                    seen_timestamps.add(timestamp)
                    points.append((lat, lon, float(elev_s) if elev_s else None, timestamp))
                except ValueError:
                    # Corrupted line (e.g. 'None' values written by previous versions
                    # of the worker): discard instead of failing the entire session.
                    logger.warning(
                        "Invalid line %d in %s, discarded: %r", line_no, tmp_path, line
                    )
        # Batches retried by the client may arrive out of order.
        points.sort(key=lambda point: point[3])
        return points

    def close_session(
        self,
        session_id: str,
        user_id: str,
        apply_rdp: bool = True,
        epsilon: float = 0.00004,
        previous: SessionSummary | None = None,
    ) -> SessionSummary | None:
        """Write the .gpx of the session and return its summary.

        ``previous`` is the route already saved for this session, if any. When the app does not get the
        answer to its "end" (but the server closed the route) the rider can resume the same session:
        its new points come after the saved route and are added to it. Before, they replaced it and
        the ride before the pause was lost.
        """
        points = self._read_points(user_id, session_id)
        if not points:
            logger.warning("No points for user=%s session=%s, no .gpx generated.", user_id, session_id)
            return None
        started_ms, ended_ms = points[0][3], points[-1][3]
        if (previous is not None and abs(ended_ms - previous.ended_ms) < 1
                and started_ms > previous.started_ms + 0.5):
            return previous  # these points were already added to the saved route: the end was delivered again

        # Distance and time are measured on the full track; RDP only lightens the GPX file.
        total_distance_km, duration_min = summarize_track(points, self.pause_gap_sec)

        if apply_rdp and len(points) >= 3:
            points = ramer_douglas_peucker(points, epsilon)

        if previous is not None and started_ms > previous.ended_ms + 0.5:
            earlier = [point for point in self._read_gpx(previous.gpx_path) if point[3] < started_ms]
            logger.info("Session resumed after its end: user=%s session=%s, %d points added to the saved route",
                        user_id, session_id, len(points))
            points = earlier + points
            total_distance_km += previous.distance_km
            duration_min += previous.duration_min
            started_ms = previous.started_ms

        final_path = self._final_path(user_id, session_id)
        self._write_gpx(points, final_path)

        logger.info(
            "Session closed: user=%s session=%s points=%d distance_km=%.3f duration_min=%.1f -> %s",
            user_id, session_id, len(points), total_distance_km, duration_min, final_path,
        )
        return SessionSummary(final_path, total_distance_km, duration_min, started_ms, ended_ms)

    def complete_session(self, session_id: str, user_id: str) -> None:
        """Remove recoverable state only after all downstream writes succeeded."""
        key = (user_id, session_id)
        tmp_path = self._tmp_path(user_id, session_id)
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        self._seen_timestamps.pop(key, None)
        self._last_point_at.pop(key, None)

    @staticmethod
    def _read_gpx(path: str) -> list[Point]:
        """Points of a .gpx written by _write_gpx (an empty list if it is missing or unreadable)."""
        points: list[Point] = []
        try:
            root = ET.parse(path).getroot()
        except (OSError, ET.ParseError):
            logger.warning("Saved GPX %s not readable: the resumed session keeps only its new points", path)
            return points
        for element in root.iter():
            if element.tag.rsplit("}", 1)[-1] != "trkpt":
                continue
            values = {child.tag.rsplit("}", 1)[-1]: child.text for child in element}
            try:
                timestamp = datetime.fromisoformat(values["time"]).timestamp() * 1000.0
                elev = float(values["ele"]) if values.get("ele") else None
                points.append((float(element.get("lat")), float(element.get("lon")), elev, timestamp))
            except (KeyError, TypeError, ValueError):
                continue
        return points

    @staticmethod
    def _write_gpx(points: list[Point], final_path: str) -> None:
        root = ET.Element("gpx", version="1.1", creator="sensor-app-gps-worker")
        trk = ET.SubElement(root, "trk")
        trkseg = ET.SubElement(trk, "trkseg")
        for lat, lon, elev, timestamp in points:
            trkpt = ET.SubElement(trkseg, "trkpt", lat=repr(lat), lon=repr(lon))
            if elev is not None:
                ET.SubElement(trkpt, "ele").text = repr(elev)
            ET.SubElement(trkpt, "time").text = _iso_from_epoch_ms(timestamp)
        ET.ElementTree(root).write(final_path, encoding="utf-8", xml_declaration=True)
