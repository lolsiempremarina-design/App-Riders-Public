"""Delivery orders for riders and their earnings.

Orders are created by admins (Flask panel under /web/admin/). A rider accepts one
order at a time, confirms the pickup and the delivery; earnings are the pay + bonus
of delivered orders. Nothing is paid out by the app: amounts are what riders earned.
"""
from datetime import date, datetime, time, timedelta

from flask import current_app, jsonify, request
from flask_security import current_user
from sqlalchemy import or_

from app.api import api_bp
from app.api.stats import load_rides, local_today, to_local, to_utc
from app.api.utils import ValidationError, api_error, clean_str, json_body, login_required_json
from app.delivery.models import ACTIVE_STATUSES, Order, utcnow
from app.messaging.service import notify_text
from extensions import db

PERIODS = ('today', 'week', 'month', 'year', 'all')
RIDER_TRANSITIONS = {
    # action: (allowed current statuses, new status)
    'picked_up': (('accepted',), 'picked_up'),
    'delivered': (('picked_up',), 'delivered'),
    'released': (('accepted',), 'available'),   # handed back before pickup
}


def _iso_local(value):
    return to_local(value).isoformat(timespec='seconds') if value else None


def order_to_dict(order, now=None):
    now = now or utcnow()
    data = {
        'id': order.id,
        'restaurant': order.restaurant_name,
        'pickup_address': order.pickup_address,
        'delivery_address': order.delivery_address,
        'customer_name': order.customer_name,
        'items': order.items,
        'notes': order.notes,
        'distance_km': order.distance_km,
        'pay': float(order.pay or 0),
        'bonus': float(order.bonus or 0),
        'total': round(order.total, 2),
        'status': order.status,
        'created_at': _iso_local(order.created_at),
        'expires_at': _iso_local(order.expires_at),
        'due_at': _iso_local(order.due_at),
        'accepted_at': _iso_local(order.accepted_at),
        'picked_up_at': _iso_local(order.picked_up_at),
        'delivered_at': _iso_local(order.delivered_at),
    }
    if order.status == 'available' and order.expires_at:
        data['seconds_left'] = max(0, int((order.expires_at - now).total_seconds()))
    if order.status == 'delivered' and order.due_at and order.delivered_at:
        data['on_time'] = order.delivered_at <= order.due_at
    return data


def _period_start(period, today):
    if period == 'today':
        return today
    if period == 'week':
        return today - timedelta(days=6)
    if period == 'month':
        return today.replace(day=1)
    if period == 'year':
        return date(today.year, 1, 1)
    return None


def _delivered_orders(user_id, start_day=None):
    query = Order.query.filter(Order.rider_id == user_id, Order.status == 'delivered')
    if start_day is not None:
        query = query.filter(Order.delivered_at >= to_utc(datetime.combine(start_day, time.min)))
    return query.order_by(Order.delivered_at.desc()).all()


def earnings_summary(orders):
    with_due = [o for o in orders if o.due_at and o.delivered_at]
    on_time = sum(1 for o in with_due if o.delivered_at <= o.due_at)
    return {
        'deliveries': len(orders),
        'pay': round(sum(float(o.pay or 0) for o in orders), 2),
        'bonus': round(sum(float(o.bonus or 0) for o in orders), 2),
        'earnings': round(sum(o.total for o in orders), 2),
        'distance_km': round(sum(o.distance_km or 0 for o in orders), 2),
        'on_time_rate': round(on_time / len(with_due), 3) if with_due else None,
    }


def _period_arg():
    period = request.args.get('period', 'today')
    if period not in PERIODS:
        raise ValidationError({'period': f"Period must be one of: {', '.join(PERIODS)}."})
    return period


# --------------------------------------------------------------------------- rider endpoints

@api_bp.get('/orders/available')
@login_required_json
def available_orders():
    now = utcnow()
    orders = (
        Order.query.filter(Order.status == 'available', or_(Order.expires_at.is_(None), Order.expires_at > now))
        .order_by(Order.created_at.desc()).limit(50).all()
    )
    return jsonify({'orders': [order_to_dict(o, now) for o in orders]})


@api_bp.get('/orders/active')
@login_required_json
def active_order():
    order = (
        Order.query.filter(Order.rider_id == current_user.id, Order.status.in_(ACTIVE_STATUSES))
        .order_by(Order.accepted_at.desc()).first()
    )
    return jsonify({'order': order_to_dict(order) if order else None})


@api_bp.post('/orders/<int:order_id>/accept')
@login_required_json
def accept_order(order_id):
    from app.auth.models import User  # local import: avoids a circular import at startup

    # Lock the rider's row until the commit: two accepts at the same moment (phone and browser)
    # run one after the other, so the second one sees the first order and is refused.
    db.session.query(User.id).filter(User.id == current_user.id).with_for_update().one()
    busy = Order.query.filter(Order.rider_id == current_user.id, Order.status.in_(ACTIVE_STATUSES)).first()
    if busy is not None:
        db.session.rollback()  # releases the lock
        return api_error(409, 'Finish or hand back your current order first.', code='active_order_exists')
    now = utcnow()
    # Conditional update: if two riders accept at the same moment only one row changes.
    updated = (
        Order.query.filter(Order.id == order_id, Order.status == 'available',
                           or_(Order.expires_at.is_(None), Order.expires_at > now))
        .update({'status': 'accepted', 'rider_id': current_user.id, 'accepted_at': now, 'updated_at': now},
                synchronize_session=False)
    )
    db.session.commit()
    if not updated:
        return api_error(409, 'This order is no longer available.', code='order_unavailable')
    return jsonify({'order': order_to_dict(db.session.get(Order, order_id))})


@api_bp.patch('/orders/<int:order_id>/status')
@login_required_json
def update_order_status(order_id):
    # Row locked until the commit: "picked up" and "hand back" sent together (two phones), or an admin
    # cancelling at the same moment, run one after the other. Before, the order could stay "picked up"
    # with no rider: hidden from everyone.
    order = Order.query.filter_by(id=order_id, rider_id=current_user.id).with_for_update().first()
    if order is None:
        return api_error(404, 'Order not found.')
    action = clean_str(json_body().get('status'))
    if action not in RIDER_TRANSITIONS:
        raise ValidationError({'status': 'Status must be "picked_up", "delivered" or "released".'})
    allowed, new_status = RIDER_TRANSITIONS[action]
    if order.status not in allowed:
        return api_error(409, f'Cannot go from "{order.status}" to "{action}".', code='invalid_transition')

    now = utcnow()
    if action == 'picked_up':
        order.picked_up_at = now
    elif action == 'delivered':
        order.delivered_at = now
    else:  # released: offered again to the other riders
        order.rider_id = None
        order.accepted_at = None
    order.status = new_status
    db.session.commit()
    if action == 'released':
        try:
            announce_handed_back(order, current_user.id)
        except Exception:  # noqa: BLE001 - the order is already handed back: a failed notice must not hide it
            db.session.rollback()
            current_app.logger.exception('Unable to announce the order handed back: order=%s', order.id)
    return jsonify({'order': order_to_dict(order)})


@api_bp.get('/orders/completed')
@login_required_json
def completed_orders():
    period = _period_arg()
    orders = _delivered_orders(current_user.id, _period_start(period, local_today()))
    return jsonify({'period': period, 'orders': [order_to_dict(o) for o in orders[:200]],
                    'summary': earnings_summary(orders)})


@api_bp.get('/rider/earnings')
@login_required_json
def rider_earnings():
    """Earnings from delivered orders plus km and time in the saddle, per local day."""
    period = request.args.get('period', 'week')
    if period not in PERIODS:
        raise ValidationError({'period': f"Period must be one of: {', '.join(PERIODS)}."})
    today = local_today()
    start = _period_start(period, today)
    orders = _delivered_orders(current_user.id, start)
    rides = load_rides(current_user.id, start, today + timedelta(days=1)) if start else load_rides(current_user.id)

    days = {}

    def day(key):
        return days.setdefault(key, {'date': key, 'deliveries': 0, 'earnings': 0.0, 'distance_km': 0.0,
                                     'duration_sec': 0, 'rides': 0})

    for order in orders:
        entry = day(to_local(order.delivered_at).date().isoformat())
        entry['deliveries'] += 1
        entry['earnings'] = round(entry['earnings'] + order.total, 2)
    for ride in rides:
        entry = day(ride.start.date().isoformat())
        entry['rides'] += 1
        entry['distance_km'] = round(entry['distance_km'] + ride.distance_km, 3)
        entry['duration_sec'] += ride.duration_sec

    summary = earnings_summary(orders)
    summary['ride_distance_km'] = round(sum(r.distance_km for r in rides), 3)
    summary['ride_duration_sec'] = sum(r.duration_sec for r in rides)
    return jsonify({
        'period': period,
        'start': start.isoformat() if start else None,
        'today': today.isoformat(),
        'summary': summary,
        'days': sorted(days.values(), key=lambda d: d['date'], reverse=True),
    })


# --------------------------------------------------------------------------- used by the admin panel

def rider_query():
    """Accounts that work on the orders: active, not admins and with the email confirmed when the email service
    is on (before, an account registered with somebody else's address got the order addresses as push)."""
    from app.auth.models import Role, User  # local import: avoids a circular import at startup

    admin_ids = [u.id for u in User.query.join(User.roles).filter(Role.name == 'admin')]
    return User.query.filter(User.active.is_(True), User.email_confirmed_at.isnot(None), User.id.notin_(admin_ids))


def order_text_values(order):
    """Placeholders of the notifications that describe an order (order_new, order_assigned)."""
    return {'restaurant': order.restaurant_name, 'pickup': order.pickup_address,
            'delivery': order.delivery_address, 'total': f'{order.total:.2f}'}


def notify_new_order(order, key='order_new', exclude=None):
    """Tell every rider (except ``exclude``) that the order is available. Returns how many were told."""
    from app.auth.models import User  # local import: avoids a circular import at startup

    rider_ids = [uid for (uid,) in rider_query().with_entities(User.id) if uid != exclude]
    return notify_text(rider_ids, 'consegne', key, link='/consegne', **order_text_values(order))


def is_offered(order, now=None):
    """True when the riders see the order and can accept it: available and its offer not expired."""
    return order.status == 'available' and (order.expires_at is None or order.expires_at > (now or utcnow()))


def announce_handed_back(order, previous_rider_id):
    """After the commit that made an accepted order available again (handed back by its rider, or released by the
    deletion of the rider's account; the admin panel uses notify_new_order and tells the admin on the page).
    Still offered: the other riders are told, like for a new order. Offer expired: no rider can see it, so the
    admins are told to offer it again. Before, nobody was told when a rider handed an order back, and an account
    deletion told the riders about orders they could not see.
    Returns how many riders were told (0 when the offer had expired)."""
    from app.auth.models import Role, User  # local import: avoids a circular import at startup

    if is_offered(order):
        return notify_new_order(order, key='order_available_again', exclude=previous_rider_id)
    admins = [u.id for u in User.query.join(User.roles).filter(Role.name == 'admin')]
    notify_text(admins, 'consegne', 'order_released_expired', link='/consegne', restaurant=order.restaurant_name)
    return 0
