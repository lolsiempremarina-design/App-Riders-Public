"""JSON API consumed by the React frontend (served under /api)."""
from flask import Blueprint

api_bp = Blueprint('api', __name__, url_prefix='/api')


@api_bp.after_request
def _no_store(response):
    # API responses are user-specific: never let browsers or the PWA cache them.
    response.headers.setdefault('Cache-Control', 'no-store')
    return response


# Route modules register themselves on api_bp when imported.
from app.api import (  # noqa: E402,F401
    account, auth, bikes, chat, confirm_email, devices, groups, municipalities, notifications, orders, profile,
    routes_history, score, sos, stats,
)
