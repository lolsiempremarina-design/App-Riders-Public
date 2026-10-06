from flask import Flask

from config import Config
from extensions import csrf, db, migrate, security


def check_production_config(app):
    """Refuse to start in production with example secrets, insecure cookies or debug mode."""
    problems = [
        f'{key} must be a random value of at least 32 characters'
        for key in ('SECRET_KEY', 'SECURITY_PASSWORD_SALT')
        if len(app.config.get(key) or '') < 32 or 'change-me' in (app.config.get(key) or '')
    ]
    if not (app.config.get('SESSION_COOKIE_SECURE') and app.config.get('REMEMBER_COOKIE_SECURE')):
        problems.append('SESSION_COOKIE_SECURE and REMEMBER_COOKIE_SECURE must be true (HTTPS)')
    if app.debug:
        problems.append('FLASK_DEBUG must be false')
    if problems:
        raise RuntimeError('Production configuration refused: ' + '; '.join(problems))


def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)

    # <int:id> in every URL stops at the database integer range (bigger ids: 404, not a 500)
    from app.api.utils import DatabaseIdConverter
    app.url_map.converters['int'] = DatabaseIdConverter

    if not app.testing:
        insecure_values = {
            'SECRET_KEY': 'fallback-key-do-not-use-in-prod',
            'SECURITY_PASSWORD_SALT': 'fallback-salt-do-not-use-in-prod',
        }
        missing = [
            key for key, fallback in insecure_values.items()
            if app.config.get(key) == fallback
        ]
        if missing:
            raise RuntimeError(
                f"Secure configuration required: set {', '.join(missing)} in .env"
            )
        if app.config.get('APP_ENV') == 'production':
            check_production_config(app)

    # Initialize extensions
    db.init_app(app)
    migrate.init_app(app, db)
    from extensions import redis_client
    redis_client.connection_pool.connection_kwargs.update(
        host=app.config['REDIS_HOST'], port=app.config['REDIS_PORT']
    )
    csrf.init_app(app)
    
    # We must import the datastores here to avoid circular imports, but models need to be loaded.
    # The import of user_datastore must be local or done carefully.
    from app.auth.models import user_datastore
    from app.core.routes import core_bp, login_in_the_app

    # No Flask-Security HTML views (login, register...): the React app logs in through /api/auth/*
    # (with the lockout after repeated failures) and the admin panel reuses that session.
    security.init_app(app, user_datastore, register_blueprint=False)
    security.unauthn_handler(login_in_the_app)

    # Register Blueprints
    from app.auth.routes import auth_bp

    # Map points of interest (/api/v1/*, used by the React map)
    from app.map import models as map_models  # noqa: F401
    from app.map.api import api_bp as map_api_bp

    # Import models for migration detection
    from app.delivery import models as delivery_models  # noqa: F401
    from app.messaging import models as messaging_models  # noqa: F401

    app.register_blueprint(core_bp)
    app.register_blueprint(auth_bp, url_prefix='/auth')
    app.register_blueprint(map_api_bp)

    # Admin panel (orders and bikes), under /web/admin/ behind Nginx
    from app.admin import admin_bp
    app.register_blueprint(admin_bp)

    # WebSocket group chat (/ws/chat/<group_id>) and management commands
    from app.cli import ror_cli
    from app.realtime import init_realtime
    init_realtime(app)
    app.cli.add_command(ror_cli)

    # JSON API for the React frontend (/api/...)
    from app.api import api_bp
    from app.api.utils import register_api_error_handlers
    app.register_blueprint(api_bp)
    register_api_error_handlers(app)

    # Trust reverse proxy headers (Nginx / Ngrok)
    from werkzeug.middleware.proxy_fix import ProxyFix
    app.wsgi_app = ProxyFix(
        app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_prefix=1
    )

    return app

