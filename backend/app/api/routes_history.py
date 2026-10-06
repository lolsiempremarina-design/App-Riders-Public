"""History of the GPS routes recorded by the GPS worker (rider_shifts + GPX files)."""
import xml.etree.ElementTree as ET
from pathlib import Path

from flask import current_app, jsonify, request, send_file
from flask_security import current_user

from app.api import api_bp
from app.api.stats import route_end, route_moving_sec, route_start
from app.api.utils import api_error, login_required_json
from app.auth.models import RiderShift
from extensions import db

MAX_PAGE_SIZE = 100
MAX_TRACK_POINTS = 5000


def _gpx_file(shift):
    """Path of the shift's GPX if it exists inside the storage directory, else None."""
    if not shift.gpx_path:
        return None
    root = Path(current_app.config['GPX_STORAGE_DIR']).resolve()
    path = Path(shift.gpx_path).resolve()
    if root != path.parent and root not in path.parents:
        return None
    return path if path.is_file() else None


def route_to_dict(shift):
    duration_sec = route_moving_sec(shift)
    distance = float(shift.total_distance_km or 0)
    return {
        'id': shift.id,
        'session_id': shift.session_id,
        'started_at': route_start(shift).isoformat(timespec='seconds'),
        'ended_at': route_end(shift).isoformat(timespec='seconds'),
        'distance_km': round(distance, 3),
        'duration_sec': duration_sec,
        'avg_speed_kmh': round(distance / (duration_sec / 3600), 2) if duration_sec else 0.0,
        'has_gpx': _gpx_file(shift) is not None,
    }


def _read_track(path):
    """[[lat, lon, iso_time|None], ...] from a GPX 1.1 file (namespace-agnostic)."""
    points = []
    for element in ET.parse(path).getroot().iter():
        if element.tag.rsplit('}', 1)[-1] != 'trkpt':
            continue
        try:
            lat, lon = float(element.get('lat')), float(element.get('lon'))
        except (TypeError, ValueError):
            continue
        timestamp = next((child.text for child in element if child.tag.rsplit('}', 1)[-1] == 'time'), None)
        points.append([lat, lon, timestamp])
    if len(points) > MAX_TRACK_POINTS:  # keep the payload light, preserving start and end
        step = len(points) / MAX_TRACK_POINTS
        points = [points[int(i * step)] for i in range(MAX_TRACK_POINTS - 1)] + [points[-1]]
    return points


def _own_route_or_404(route_id):
    shift = RiderShift.query.filter_by(id=route_id, user_id=current_user.id).first()
    if shift is None:
        return None, api_error(404, 'Route not found.')
    return shift, None


def _int_arg(name, default, minimum, maximum):
    try:
        value = int(request.args.get(name, default))
    except (TypeError, ValueError):
        value = default
    return max(minimum, min(maximum, value))


@api_bp.get('/routes')
@login_required_json
def list_routes():
    limit = _int_arg('limit', 20, 1, MAX_PAGE_SIZE)
    offset = _int_arg('offset', 0, 0, 10**9)
    query = RiderShift.query.filter_by(user_id=current_user.id)
    total = query.count()
    shifts = query.order_by(RiderShift.created_at.desc(), RiderShift.id.desc()).offset(offset).limit(limit).all()
    return jsonify({'routes': [route_to_dict(s) for s in shifts], 'total': total,
                    'limit': limit, 'offset': offset})


@api_bp.get('/routes/<int:route_id>')
@login_required_json
def get_route(route_id):
    shift, error = _own_route_or_404(route_id)
    if error:
        return error
    data = route_to_dict(shift)
    path = _gpx_file(shift)
    try:
        data['points'] = _read_track(path) if path else []
    except ET.ParseError:
        current_app.logger.exception('Corrupted GPX for route=%s', shift.id)
        data['points'] = []
        data['has_gpx'] = False
    return jsonify(data)


@api_bp.get('/routes/<int:route_id>/gpx')
@login_required_json
def download_route_gpx(route_id):
    shift, error = _own_route_or_404(route_id)
    if error:
        return error
    path = _gpx_file(shift)
    if path is None:
        return api_error(404, 'The GPX file of this route is not available.')
    started = route_to_dict(shift)['started_at'][:16].replace(':', '-').replace('T', '_')
    return send_file(path, mimetype='application/gpx+xml', as_attachment=True,
                     download_name=f'ror-percorso-{started}.gpx', max_age=0)


@api_bp.delete('/routes/<int:route_id>')
@login_required_json
def delete_route(route_id):
    shift, error = _own_route_or_404(route_id)
    if error:
        return error
    path = _gpx_file(shift)
    db.session.delete(shift)
    db.session.commit()
    if path is not None:
        try:
            path.unlink(missing_ok=True)
        except OSError:
            current_app.logger.exception('Unable to delete GPX for route=%s', route_id)
    return jsonify({'success': True, 'id': route_id})
