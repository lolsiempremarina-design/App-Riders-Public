"""Rider score, computed from real data with a transparent formula.

Daily points = 10 per km ridden (GPS routes)
             + 20 per delivered order
             +  5 per order delivered by its promised time (``due_at``).
Composition of a day: punctuality (on-time share of delivered orders that had a due
time) and safe riding (share of GPS routes of the day without a confirmed fall).
Values that cannot be computed are ``null``.
"""
from datetime import datetime, time, timedelta

from flask import jsonify, request
from flask_security import current_user

from app.api import api_bp
from app.api.stats import load_rides, local_today, to_local, to_utc
from app.api.utils import login_required_json
from app.auth.models import FallEvent, RiderShift
from app.delivery.models import Order

POINTS_PER_KM = 10
POINTS_PER_DELIVERY = 20
POINTS_PER_ON_TIME = 5
MAX_DAYS = 31


def _day_score(km, deliveries, on_time):
    return round(km * POINTS_PER_KM + deliveries * POINTS_PER_DELIVERY + on_time * POINTS_PER_ON_TIME)


def compute_score(user_id, days, today):
    first = today - timedelta(days=days - 1)
    utc_start = to_utc(datetime.combine(first, time.min))
    rides = load_rides(user_id, first, today + timedelta(days=1))
    orders = Order.query.filter(Order.rider_id == user_id, Order.status == 'delivered',
                                Order.delivered_at >= utc_start).all()
    shifts = RiderShift.query.filter(RiderShift.user_id == user_id,
                                     RiderShift.created_at >= utc_start - timedelta(days=1)).all()
    falls = FallEvent.query.filter(FallEvent.user_id == user_id,
                                   FallEvent.timestamp >= utc_start - timedelta(days=1)).all()
    fall_sessions = {f.session_id for f in falls}

    result = []
    for offset in range(days):
        day = first + timedelta(days=offset)
        km = sum(r.distance_km for r in rides if r.start.date() == day)
        delivered = [o for o in orders if to_local(o.delivered_at).date() == day]
        with_due = [o for o in delivered if o.due_at]
        on_time = sum(1 for o in with_due if o.delivered_at <= o.due_at)
        day_shifts = [s for s in shifts if to_local(s.started_at or s.created_at).date() == day]
        safe = sum(1 for s in day_shifts if s.session_id not in fall_sessions)
        result.append({
            'date': day.isoformat(),
            'score': _day_score(km, len(delivered), on_time),
            'distance_km': round(km, 3),
            'deliveries': len(delivered),
            'on_time': on_time,
            'punctuality': round(on_time / len(with_due), 3) if with_due else None,
            'safe_riding': round(safe / len(day_shifts), 3) if day_shifts else None,
        })
    return result


@api_bp.get('/score')
@login_required_json
def rider_score():
    try:
        days = max(1, min(MAX_DAYS, int(request.args.get('days', 7))))
    except (TypeError, ValueError):
        days = 7
    today = local_today()
    series = compute_score(current_user.id, days, today)
    return jsonify({
        'today': today.isoformat(),
        'days': series,
        'total': sum(d['score'] for d in series),
        'rules': {'per_km': POINTS_PER_KM, 'per_delivery': POINTS_PER_DELIVERY, 'per_on_time': POINTS_PER_ON_TIME},
    })
