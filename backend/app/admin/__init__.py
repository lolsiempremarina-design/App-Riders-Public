"""Admin panel (served under /web/admin/): delivery orders (create, edit, assign, cancel), statistics, CSV exports and bikes."""
from flask import Blueprint

admin_bp = Blueprint('admin', __name__, url_prefix='/admin')

from app.admin import routes  # noqa: E402,F401
