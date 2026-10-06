"""Ride statistics for the React app, computed from real recorded data.

Source: the GPS routes (``rider_shifts``, written by the GPS worker), stored as naive UTC
and grouped here by the rider's local calendar (``APP_TIMEZONE``, default Europe/Rome).
Nothing is estimated: the pauses of a route are known only when its last GPS point is
recorded (``ended_at``); older routes without it are counted apart.
"""
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from flask import current_app, jsonify, request
from flask_security import current_user

from app.api import api_bp
from app.api.utils import api_error, login_required_json
from app.auth.models import RiderShift

PERIODS = ('week', 'month', 'year', 'always')
MONTHS_IN_MONTH_VIEW = 6


@dataclass(frozen=True)
class Ride:
    """One recorded GPS route, in local time."""

    id: int
    start: datetime  # naive, local time
    distance_km: float
    duration_sec: int  # moving time: the GPS worker leaves out the pauses
    pause_sec: int | None  # None when the last GPS point was not recorded


def _tz():
    return ZoneInfo(current_app.config.get('APP_TIMEZONE', 'Europe/Rome'))


def local_today():
    return datetime.now(_tz()).date()


def to_local(value):
    """Convert a stored naive-UTC datetime into naive local time."""
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(_tz()).replace(tzinfo=None)


def route_start(shift):
    """Local start of a GPS route: its first GPS point, or closing time minus duration for older rows."""
    if shift.started_at is not None:
        return to_local(shift.started_at)
    return to_local(shift.created_at) - timedelta(seconds=round((shift.duration_min or 0) * 60))


def route_end(shift):
    """Local end of a GPS route: its last GPS point, or closing time for older rows."""
    return to_local(shift.ended_at or shift.created_at)


def route_moving_sec(shift):
    return round((shift.duration_min or 0) * 60)


def route_pause_sec(shift):
    """Time between the first and the last GPS point that is not moving time, None if unknown."""
    if shift.started_at is None or shift.ended_at is None:
        return None
    elapsed = round((shift.ended_at - shift.started_at).total_seconds())
    return max(0, elapsed - route_moving_sec(shift))


def to_utc(local_value):
    """Convert a naive local datetime into naive UTC (for database filters)."""
    return local_value.replace(tzinfo=_tz()).astimezone(timezone.utc).replace(tzinfo=None)


def load_rides(user_id, start=None, end=None):
    """Rides of ``user_id`` whose local start is in [start, end) (both optional, local dates)."""
    route_q = RiderShift.query.filter(RiderShift.user_id == user_id)
    if start is not None:
        utc_start = to_utc(datetime.combine(start, time.min))
        route_q = route_q.filter(RiderShift.created_at >= utc_start - timedelta(days=1))
    if end is not None:
        utc_end = to_utc(datetime.combine(end, time.min))
        route_q = route_q.filter(RiderShift.created_at < utc_end + timedelta(days=1))

    rides = [
        Ride(shift.id, route_start(shift), float(shift.total_distance_km or 0),
             route_moving_sec(shift), route_pause_sec(shift))
        for shift in route_q.all()
    ]
    rides = [
        r for r in rides
        if (start is None or r.start.date() >= start) and (end is None or r.start.date() < end)
    ]
    rides.sort(key=lambda r: r.start)
    return rides


def _speed(distance_km, duration_sec):
    return round(distance_km / (duration_sec / 3600), 2) if duration_sec > 0 else 0.0


def summarize(rides):
    distance = sum(r.distance_km for r in rides)
    duration = sum(r.duration_sec for r in rides)
    return {
        'count': len(rides),
        'distance_km': round(distance, 3),
        'duration_sec': duration,  # moving time
        'avg_speed_kmh': _speed(distance, duration),
        # Best average speed of a single ride (no instantaneous peak is recorded).
        'best_speed_kmh': max((_speed(r.distance_km, r.duration_sec) for r in rides), default=0.0),
        # Pauses of the rides that record them; the others are counted, not estimated.
        'pause_sec': sum(r.pause_sec for r in rides if r.pause_sec is not None),
        'pause_unknown_count': sum(1 for r in rides if r.pause_sec is None),
    }


def _month_start(value, months_back=0):
    month_index = value.year * 12 + value.month - 1 - months_back
    return date(month_index // 12, month_index % 12 + 1, 1)


def _next_month(value):
    return _month_start(value, -1)


def _series(rides, key_fn):
    groups = {}
    for ride in rides:
        groups.setdefault(key_fn(ride), []).append(ride)
    return [
        {'key': key, **{k: v for k, v in summarize(items).items()
                        if k in ('count', 'distance_km', 'duration_sec', 'avg_speed_kmh')}}
        for key, items in sorted(groups.items())
    ]


def _bucket(key, start, end, rides, series_key):
    selected = [r for r in rides if start <= r.start.date() < end]
    return {
        'key': key,
        'start': start.isoformat(),
        'end': (end - timedelta(days=1)).isoformat(),
        'summary': summarize(selected),
        'series': _series(selected, series_key),
    }


def build_period(user_id, period, today):
    """Buckets (chips) for a period view, oldest first, each with a chart series."""
    if period == 'week':
        first = today - timedelta(days=6)
        rides = load_rides(user_id, first, today + timedelta(days=1))
        buckets = [
            _bucket(day.isoformat(), day, day + timedelta(days=1), rides, lambda r: f'{r.start.hour:02d}:00')
            for day in (first + timedelta(days=i) for i in range(7))
        ]
    elif period == 'month':
        first = _month_start(today, MONTHS_IN_MONTH_VIEW - 1)
        rides = load_rides(user_id, first, _next_month(today))
        buckets = []
        for i in range(MONTHS_IN_MONTH_VIEW):
            start = _month_start(today, MONTHS_IN_MONTH_VIEW - 1 - i)
            buckets.append(_bucket(start.strftime('%Y-%m'), start, _next_month(start), rides,
                                   lambda r: r.start.date().isoformat()))
    elif period == 'year':
        rides = load_rides(user_id)
        years = sorted({r.start.year for r in rides} | {today.year})
        buckets = [
            _bucket(str(year), date(year, 1, 1), date(year + 1, 1, 1), rides, lambda r: f'{r.start:%Y-%m}')
            for year in years
        ]
    else:  # always
        rides = load_rides(user_id)
        first = rides[0].start.date() if rides else today
        bucket = _bucket('all', first, today + timedelta(days=1), rides, lambda r: f'{r.start:%Y-%m}')
        buckets = [bucket]

    # `rides` already covers exactly the buckets' range.
    return {
        'period': period,
        'today': today.isoformat(),
        'timezone': str(_tz()),
        'summary': summarize(rides),
        'buckets': buckets,
    }


@api_bp.get('/stats/period')
@login_required_json
def stats_period():
    period = request.args.get('period', 'week')
    if period not in PERIODS:
        return api_error(400, f"period must be one of: {', '.join(PERIODS)}.")
    return jsonify(build_period(current_user.id, period, local_today()))


@api_bp.get('/stats/overview')
@login_required_json
def stats_overview():
    """Last 7 days (for the day chips of the stats page) plus all-time totals."""
    today = local_today()
    week = build_period(current_user.id, 'week', today)
    days = [{'date': b['key'], **b['summary']} for b in week['buckets']]
    return jsonify({
        'today': today.isoformat(),
        'timezone': week['timezone'],
        'days': days,
        'week': week['summary'],
        'all_time': summarize(load_rides(current_user.id)),
    })
