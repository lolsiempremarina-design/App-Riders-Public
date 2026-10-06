from urllib.parse import quote

from flask import Blueprint, current_app, jsonify, redirect, request, url_for
from flask_security import current_user

from app.api.utils import api_error, is_api_request

core_bp = Blueprint('core', __name__)


@core_bp.get("/")
def index():
    """/web/ only hosts the admin panel now (the old HTML pages were replaced by the React app)."""
    if current_user.is_authenticated and not current_user.has_role('admin'):
        return redirect('/')
    return redirect(url_for('admin.index'))


@core_bp.get("/.well-known/assetlinks.json")
def android_asset_links():
    """Android App Links: invitation links (/gruppi?invito=...) and bike QR codes (/bici/...) open the app.

    Served by Nginx at the site root. Android checks that the APK signing certificate is listed here;
    without configured fingerprints (ANDROID_CERT_SHA256) the links simply open in the browser.
    """
    fingerprints = current_app.config['ANDROID_CERT_SHA256']
    if not fingerprints:
        return api_error(404, 'App Links are not configured.')
    response = jsonify([{
        'relation': ['delegate_permission/common.handle_all_urls'],
        'target': {
            'namespace': 'android_app',
            'package_name': current_app.config['ANDROID_APP_ID'],
            'sha256_cert_fingerprints': fingerprints,
        },
    }])
    response.headers['Cache-Control'] = 'public, max-age=3600'
    return response


def login_in_the_app(mechanisms=None, headers=None):
    """Flask-Security callback for protected pages without a session (the admin panel).

    There is no Flask login page any more: the React login (/accedi, with the lockout after repeated
    failures) sets the same session cookie and comes back here through ?next=.
    """
    if is_api_request():
        return api_error(401, 'Authentication required.')
    target = request.script_root + request.path
    if request.query_string:
        target += '?' + request.query_string.decode('utf-8', 'replace')
    return redirect(f"/accedi?next={quote(target, safe='')}")
