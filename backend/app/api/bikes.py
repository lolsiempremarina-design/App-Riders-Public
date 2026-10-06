"""Community bikes: public pages (QR) and linking a bike to the rider who is using it.

Statistics come from the GPS routes recorded while the bike was linked
(``rider_shifts.bike_id``). The CO₂ figure is an estimate and says so: km that a
car would have emitted at ``CAR_CO2_KG_PER_KM``.
"""
from flask import jsonify
from flask_security import current_user
from sqlalchemy import func

from app.api import api_bp
from app.api.stats import to_local
from app.api.utils import api_error, login_required_json
from app.auth.models import Bike, RiderShift, User
from app.messaging.service import notify_text
from extensions import db

CAR_CO2_KG_PER_KM = 0.12  # average new car in the EU, order of magnitude


def _stats_by_bike(bike_ids):
    if not bike_ids:
        return {}
    rows = (
        db.session.query(
            RiderShift.bike_id,
            func.count(RiderShift.id),
            func.coalesce(func.sum(RiderShift.total_distance_km), 0),
            func.count(func.distinct(RiderShift.user_id)),
            func.max(RiderShift.created_at),
        )
        .filter(RiderShift.bike_id.in_(bike_ids))
        .group_by(RiderShift.bike_id).all()
    )
    return {bike_id: (rides, float(km), riders, last) for bike_id, rides, km, riders, last in rows}


def bike_to_dict(bike, stats=None, detailed=False):
    rides, km, riders, last = stats or (0, 0.0, 0, None)
    data = {
        'code': bike.bike_id,
        'label': bike.label or f'Bike {bike.bike_id}',
        'model': bike.model,
        'location': bike.location,
        'description': bike.description,
        'in_use': bike.user_id is not None,
        'is_mine': bool(current_user.is_authenticated and bike.user_id == current_user.id),
        'stats': {
            'rides': rides,
            'distance_km': round(km, 2),
            'riders': riders,
            'co2_saved_kg': round(km * CAR_CO2_KG_PER_KM, 1),
            'last_ride_at': to_local(last).isoformat(timespec='seconds') if last else None,
        },
    }
    if detailed:
        data['history'] = [line.strip() for line in (bike.history or '').splitlines() if line.strip()]
        data['contact_phone'] = bike.contact_phone
        data['co2_factor_kg_per_km'] = CAR_CO2_KG_PER_KM
    return data


def _bike_or_404(code):
    bike = Bike.query.filter(func.lower(Bike.bike_id) == (code or '').lower()).first()
    if bike is None:
        return None, api_error(404, 'Bike not found.')
    return bike, None


@api_bp.get('/bikes')
def list_bikes():
    bikes = Bike.query.order_by(Bike.bike_id).all()
    stats = _stats_by_bike([b.id for b in bikes])
    return jsonify({'bikes': [bike_to_dict(b, stats.get(b.id)) for b in bikes]})


@api_bp.get('/bikes/mine')
@login_required_json
def my_bike():
    bike = Bike.query.filter_by(user_id=current_user.id).first()
    if bike is None:
        return jsonify({'bike': None})
    return jsonify({'bike': bike_to_dict(bike, _stats_by_bike([bike.id]).get(bike.id), detailed=True)})


@api_bp.get('/bikes/<code>')
def get_bike(code):
    bike, error = _bike_or_404(code)
    if error:
        return error
    return jsonify({'bike': bike_to_dict(bike, _stats_by_bike([bike.id]).get(bike.id), detailed=True)})


@api_bp.post('/bikes/<code>/link')
@login_required_json
def link_bike(code):
    """Take the bike: from now on my GPS routes count for it. A bike has one rider at a time."""
    bike, error = _bike_or_404(code)
    if error:
        return error
    # Lock the rider's row until the commit: two bikes taken at the same moment ran into the
    # one-bike-per-rider constraint (500); now the second one simply replaces the first.
    db.session.query(User.id).filter(User.id == current_user.id).with_for_update().one()
    db.session.refresh(bike)
    previous_user_id = bike.user_id
    if previous_user_id != current_user.id:
        mine = Bike.query.filter_by(user_id=current_user.id).first()
        if mine is not None:
            mine.user_id = None
            db.session.flush()
        bike.user_id = current_user.id
        db.session.commit()
        if previous_user_id is not None:
            notify_text([previous_user_id], 'sistema', 'bike_taken', link=f'/bici/{bike.bike_id}',
                        bike=bike.label or bike.bike_id)
    return jsonify({'bike': bike_to_dict(bike, _stats_by_bike([bike.id]).get(bike.id), detailed=True)})


@api_bp.delete('/bikes/mine')
@login_required_json
def unlink_bike():
    bike = Bike.query.filter_by(user_id=current_user.id).first()
    if bike is not None:
        bike.user_id = None
        db.session.commit()
    return jsonify({'bike': None})
