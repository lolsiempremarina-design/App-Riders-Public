from flask import Blueprint, jsonify
from flask_security import current_user

auth_bp = Blueprint('auth', __name__)


@auth_bp.get("/check_session")
def check_session():
    """Internal endpoint for FastAPI (/stream, /session/*): is the session cookie valid?"""
    if not current_user.is_authenticated or current_user.email_confirmed_at is None:  # email to confirm first
        return jsonify({"authenticated": False}), 401
    return jsonify({
        "user_id": current_user.id,
        "authenticated": True,
        "sensors_enabled": current_user.sensors_enabled,
        "share_location_with_groups": current_user.share_location_with_groups,
    })
