import re

from flask import Blueprint, jsonify, request

from app.map.models import BicycleParking, BicycleRepair, Station, Toilet

api_bp = Blueprint("map_api", __name__, url_prefix="/api/v1")

GEOHASH5 = re.compile(r"^[0-9b-hjkmnp-z]{5}$")  # geohash alphabet (no a, i, l, o)
MAX_CELLS = 50  # the React map asks for 20 at a time


def _find_by_geohashes(model, gh5_list):
    return model.query.filter(model.gh5.in_(gh5_list)).all()


def _geohash_list_or_400():
    gh5_param = request.args.get("gh5")
    if not gh5_param:
        return None, (jsonify({"error": "Missing gh5 parameter"}), 400)
    cells = [cell.strip().lower() for cell in gh5_param.split(",") if cell.strip()]
    # checked before the query: a NUL character or a huge list made the query fail (500)
    if not cells or len(cells) > MAX_CELLS or not all(GEOHASH5.match(cell) for cell in cells):
        return None, (jsonify({"error": f"gh5 must be 1 to {MAX_CELLS} geohashes of 5 characters"}), 400)
    return cells, None


@api_bp.get("/fountains")
def get_fountains():
    gh5_list, error = _geohash_list_or_400()
    if error:
        return error
    try:
        data = _find_by_geohashes(Station, gh5_list)
        return jsonify([s.to_dict() for s in data])
    except Exception:  # noqa: BLE001
        current_app_logger().exception("Error fetching fountains")
        return jsonify({"error": "Failed to fetch fountains"}), 500


@api_bp.get("/toilets")
def get_toilets():
    gh5_list, error = _geohash_list_or_400()
    if error:
        return error
    try:
        data = _find_by_geohashes(Toilet, gh5_list)
        return jsonify([t.to_dict() for t in data])
    except Exception:  # noqa: BLE001
        current_app_logger().exception("Error fetching toilets")
        return jsonify({"error": "Failed to fetch toilets"}), 500


@api_bp.get("/bicycle_repair")
def get_bicycle_repair():
    gh5_list, error = _geohash_list_or_400()
    if error:
        return error
    try:
        data = _find_by_geohashes(BicycleRepair, gh5_list)
        return jsonify([b.to_dict() for b in data])
    except Exception:  # noqa: BLE001
        current_app_logger().exception("Error fetching bicycle repair")
        return jsonify({"error": "Failed to fetch bicycle repair"}), 500


@api_bp.get("/bicycle-parkings")
def get_bicycle_parkings():
    gh5_list, error = _geohash_list_or_400()
    if error:
        return error
    try:
        data = _find_by_geohashes(BicycleParking, gh5_list)
        return jsonify([b.to_dict() for b in data])
    except Exception:  # noqa: BLE001
        current_app_logger().exception("Error fetching bicycle parkings")
        return jsonify({"error": "Failed to fetch bicycle parkings"}), 500




def current_app_logger():
    from flask import current_app

    return current_app.logger
