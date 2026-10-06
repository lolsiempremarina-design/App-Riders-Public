"""Numbers of the admin panel: statistics of a period and the CSV exports of the deliveries.

Days are the local calendar days of APP_TIMEZONE, like in the app: a delivery belongs to the day it was
delivered, an order to the day it was created. Only what was recorded is counted, nothing is estimated.
"""
import csv
import io
from datetime import date, datetime, time, timedelta
from statistics import median

from sqlalchemy import func, or_

from app.api.orders import earnings_summary
from app.api.stats import local_today, to_local, to_utc
from app.auth.models import User
from app.delivery.models import ACTIVE_STATUSES, Order, utcnow
from extensions import db

MAX_RANGE_DAYS = 366
# days the panel accepts: the year 1 or 9999 made the conversion to UTC overflow (error 500)
EARLIEST_DAY, LATEST_DAY = date(2000, 1, 1), date(2100, 12, 31)
DAYS_IN_DAY_CHART = 62  # longer periods are drawn one bar per month
DELETED_RIDER = '(account eliminato)'
# a cell starting with one of these is run as a formula by Excel / LibreOffice: restaurant names and
# usernames are typed by people, so they are written as text
FORMULA_START = ('=', '+', '-', '@', '\t', '\r')


# --------------------------------------------------------------------------- period

def parse_range(args):
    """(first day, last day, problem) from ?from=&to= (ISO dates); today when missing, problem when wrong."""
    today = local_today()
    try:
        first = date.fromisoformat(args.get('from') or today.isoformat())
        last = date.fromisoformat(args.get('to') or first.isoformat())
    except ValueError:
        return today, today, 'Date non valide: sono mostrati i dati di oggi.'
    if not (EARLIEST_DAY <= first <= LATEST_DAY and EARLIEST_DAY <= last <= LATEST_DAY):
        return today, today, f'Date dal {EARLIEST_DAY.year} al {LATEST_DAY.year}: sono mostrati i dati di oggi.'
    if last < first:
        first, last = last, first
    if (last - first).days >= MAX_RANGE_DAYS:
        return last - timedelta(days=MAX_RANGE_DAYS - 1), last, 'Al massimo un anno alla volta: periodo accorciato.'
    return first, last, None


def presets(today):
    """Ready-made periods of the statistics page: (label, first day, last day)."""
    yesterday = today - timedelta(days=1)
    month_start = today.replace(day=1)
    previous_month_end = month_start - timedelta(days=1)
    return [
        ('Oggi', today, today),
        ('Ieri', yesterday, yesterday),
        ('Ultimi 7 giorni', today - timedelta(days=6), today),
        ('Questo mese', month_start, today),
        ('Mese scorso', previous_month_end.replace(day=1), previous_month_end),
    ]


def _utc_bounds(first, last):
    """[start, end) in naive UTC of the local days first..last."""
    return (to_utc(datetime.combine(first, time.min)),
            to_utc(datetime.combine(last + timedelta(days=1), time.min)))


def delivered_between(first, last, rider_id=None):
    start, end = _utc_bounds(first, last)
    query = Order.query.filter(Order.status == 'delivered', Order.delivered_at >= start, Order.delivered_at < end)
    if rider_id is not None:
        query = query.filter(Order.rider_id == rider_id)
    return query.order_by(Order.delivered_at, Order.id).all()


# --------------------------------------------------------------------------- statistics

def _median_minutes(orders, since, until):
    """Typical minutes between two moments of the orders (median: one forgotten order does not move it)."""
    values = [(getattr(o, until) - getattr(o, since)).total_seconds() / 60
              for o in orders if getattr(o, since) and getattr(o, until)]
    return round(median(values), 1) if values else None


def _usernames(rider_ids):
    ids = [rider_id for rider_id in rider_ids if rider_id is not None]
    return dict(db.session.query(User.id, User.username).filter(User.id.in_(ids))) if ids else {}


def rider_rows(delivered):
    """One row per rider with deliveries, the highest earnings first."""
    groups = {}
    for order in delivered:
        groups.setdefault(order.rider_id, []).append(order)
    names = _usernames(groups)
    rows = [
        {'rider_id': rider_id, 'username': names.get(rider_id, DELETED_RIDER), **earnings_summary(orders),
         'delivery_min': _median_minutes(orders, 'picked_up_at', 'delivered_at')}
        for rider_id, orders in groups.items()
    ]
    rows.sort(key=lambda row: (-row['earnings'], row['username'].lower()))
    return rows


def _chart(first, last, created, delivered):
    """Orders created and delivered per hour (one day), per day or per month (long periods)."""
    days = (last - first).days + 1
    if days == 1:
        unit, keys = 'ora', [f'{hour:02d}' for hour in range(24)]

        def key_of(value):
            return f'{to_local(value).hour:02d}'
    elif days <= DAYS_IN_DAY_CHART:
        unit, keys = 'giorno', [(first + timedelta(days=i)).isoformat() for i in range(days)]

        def key_of(value):
            return to_local(value).date().isoformat()
    else:
        unit, keys = 'mese', sorted({(first + timedelta(days=i)).strftime('%Y-%m') for i in range(days)})

        def key_of(value):
            return to_local(value).strftime('%Y-%m')

    bars = {key: {'key': key, 'created': 0, 'delivered': 0} for key in keys}
    for orders, moment, counter in ((created, 'created_at', 'created'), (delivered, 'delivered_at', 'delivered')):
        for order in orders:
            bar = bars.get(key_of(getattr(order, moment)))
            if bar is not None:
                bar[counter] += 1
    peak = max((max(bar['created'], bar['delivered']) for bar in bars.values()), default=0)
    return {'unit': unit, 'bars': list(bars.values()), 'peak': peak}


def period_stats(first, last):
    start, end = _utc_bounds(first, last)
    now = utcnow()
    delivered = delivered_between(first, last)
    created = Order.query.filter(Order.created_at >= start, Order.created_at < end).all()
    cancelled = Order.query.filter(Order.status == 'cancelled', Order.cancelled_at >= start,
                                   Order.cancelled_at < end).count()
    in_progress = dict(db.session.query(Order.status, func.count(Order.id))
                       .filter(Order.status.in_(ACTIVE_STATUSES)).group_by(Order.status).all())
    offered = Order.query.filter(Order.status == 'available',
                                 or_(Order.expires_at.is_(None), Order.expires_at > now)).count()
    return {
        'summary': earnings_summary(delivered),
        'created': len(created),
        'cancelled': cancelled,
        # created in the period, never taken and no longer offered
        'expired': sum(1 for o in created if o.status == 'available' and o.expires_at and o.expires_at <= now),
        'now': {'offered': offered, 'accepted': in_progress.get('accepted', 0),
                'picked_up': in_progress.get('picked_up', 0)},
        'times': {
            'accept': _median_minutes(delivered, 'created_at', 'accepted_at'),
            'pickup': _median_minutes(delivered, 'accepted_at', 'picked_up_at'),
            'delivery': _median_minutes(delivered, 'picked_up_at', 'delivered_at'),
            'total': _median_minutes(delivered, 'created_at', 'delivered_at'),
        },
        'riders': rider_rows(delivered),
        'chart': _chart(first, last, created, delivered),
    }


# --------------------------------------------------------------------------- CSV

def _text(value):
    text = '' if value is None else str(value)
    return "'" + text if text.startswith(FORMULA_START) else text


def _number(value, digits=2):
    """Decimal comma, as Excel and LibreOffice in Italian expect with the ';' separator."""
    return '' if value is None else f'{float(value):.{digits}f}'.replace('.', ',')


def _local(value, fmt='%d/%m/%Y %H:%M'):
    return to_local(value).strftime(fmt) if value else ''


def _csv(header, rows):
    out = io.StringIO()
    out.write('﻿')  # BOM: Excel reads the file as UTF-8 (accents, €)
    writer = csv.writer(out, delimiter=';')
    writer.writerow(header)
    writer.writerows(rows)
    return out.getvalue()


def deliveries_csv(first, last, rider_id=None):
    """One row per delivered order, by rider and time. Only what is needed to pay the riders: no customer,
    no addresses, no contents (the export is a file that travels outside the server)."""
    delivered = delivered_between(first, last, rider_id)
    names = _usernames({o.rider_id for o in delivered})
    delivered.sort(key=lambda o: (names.get(o.rider_id, DELETED_RIDER).lower(), o.delivered_at))
    rows = [[
        _local(o.delivered_at, '%d/%m/%Y'), _local(o.delivered_at, '%H:%M'), _text(names.get(o.rider_id, DELETED_RIDER)),
        o.id, _text(o.restaurant_name), _number(o.distance_km), _number(o.pay), _number(o.bonus), _number(o.total),
        _local(o.due_at), ('sì' if o.delivered_at <= o.due_at else 'no') if o.due_at else '',
        _number((o.delivered_at - o.picked_up_at).total_seconds() / 60 if o.picked_up_at else None, 0),
    ] for o in delivered]
    return _csv(['Data', 'Ora', 'Rider', 'Ordine', 'Locale', 'Km', 'Compenso €', 'Bonus €', 'Totale €',
                 'Promessa entro', 'Puntuale', 'Minuti dal ritiro'], rows)


def riders_csv(first, last):
    """One row per rider with the totals of the period, plus the total of everybody."""
    delivered = delivered_between(first, last)

    def row(name, summary, delivery_min):
        rate = summary['on_time_rate']
        return [_text(name), summary['deliveries'], _number(summary['distance_km']), _number(summary['pay']),
                _number(summary['bonus']), _number(summary['earnings']),
                _number(rate * 100 if rate is not None else None, 1), _number(delivery_min, 0)]

    rows = [row(r['username'], r, r['delivery_min']) for r in rider_rows(delivered)]
    rows.append(row('TOTALE', earnings_summary(delivered), _median_minutes(delivered, 'picked_up_at', 'delivered_at')))
    return _csv(['Rider', 'Consegne', 'Km', 'Compenso €', 'Bonus €', 'Totale €', 'Puntualità %',
                 'Minuti dal ritiro (mediana)'], rows)
