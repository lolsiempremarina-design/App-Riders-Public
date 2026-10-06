import os

from dotenv import load_dotenv

# Load environment variables from .env file in the current directory
load_dotenv()


def _env_bool(name, default=False):
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in {'1', 'true', 'yes', 'on'}


def _env_int(name, default):
    try:
        return max(0, int(os.environ.get(name, default)))
    except (TypeError, ValueError):
        return default


def engine_options(database_uri):
    """SQLAlchemy engine options for ``database_uri``.

    Every PostgreSQL session runs in UTC. The columns are "timestamp without time zone" and several defaults
    are UTC datetimes *with* a zone, which PostgreSQL converts using the session time zone (also now() in
    rider_shifts and to_timestamp() in the GPS worker). Before, the times were right only because the postgres
    image happens to start in UTC: with a database in Europe/Rome (a TZ on the container, or PostgreSQL
    installed on an Italian server) part of them would have moved one or two hours.
    """
    # Check each pooled connection before using it: after a restart of PostgreSQL alone (update,
    # crash, `docker compose up` that recreates db) the old connections are dead and the first
    # request of every Gunicorn worker failed with a 500.
    options = {'pool_pre_ping': True}
    if database_uri.startswith('postgresql'):
        options['connect_args'] = {'options': '-c timezone=UTC'}
    return options

class Config:
    # 'production' enables the strict checks in create_app (secrets, secure cookies, no debug)
    APP_ENV = os.environ.get('APP_ENV', 'development').strip().lower()

    # --- SECURITY KEYS ---
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'fallback-key-do-not-use-in-prod'
    SECURITY_PASSWORD_SALT = os.environ.get('SECURITY_PASSWORD_SALT') or 'fallback-salt-do-not-use-in-prod'

    # --- DATABASE CONFIGURATION ---
    DB_USER = os.environ.get('DB_USER', 'postgres')
    DB_PASSWORD = os.environ.get('DB_PASSWORD', '')
    DB_HOST = os.environ.get('DB_HOST', 'localhost')
    DB_PORT = os.environ.get('DB_PORT', '5432')
    DB_NAME = os.environ.get('DB_NAME', 'testlogin')
    REDIS_HOST = os.environ.get('REDIS_HOST', 'localhost')
    REDIS_PORT = int(os.environ.get('REDIS_PORT', '6379'))
    GPX_STORAGE_DIR = os.environ.get('GPX_STORAGE_DIR', '/data/volume_gpx_storage')
    APP_TIMEZONE = os.environ.get('APP_TIMEZONE', 'Europe/Rome')

    # --- SOS EMAIL NOTIFICATIONS (optional: without MAIL_SERVER no email is sent) ---
    MAIL_SERVER = os.environ.get('MAIL_SERVER', '')
    MAIL_PORT = int(os.environ.get('MAIL_PORT', '587'))
    MAIL_USE_TLS = _env_bool('MAIL_USE_TLS', True)
    MAIL_USE_SSL = _env_bool('MAIL_USE_SSL', False)
    MAIL_USERNAME = os.environ.get('MAIL_USERNAME', '')
    MAIL_PASSWORD = os.environ.get('MAIL_PASSWORD', '')
    MAIL_FROM = os.environ.get('MAIL_FROM', '') or os.environ.get('MAIL_USERNAME', '')

    # --- PRIVACY (GDPR): shown in the app; empty = the app says "not configured" ---
    PRIVACY_CONTROLLER_NAME = os.environ.get('PRIVACY_CONTROLLER_NAME', '').strip()
    PRIVACY_CONTACT_EMAIL = os.environ.get('PRIVACY_CONTACT_EMAIL', '').strip()
    POSITION_TTL = _env_int('POSITION_TTL', 90)
    # Retention in days, applied by `flask ror purge-expired` (0 = kept until the user deletes them).
    ROUTE_RETENTION_DAYS = _env_int('ROUTE_RETENTION_DAYS', 0)
    NOTIFICATION_RETENTION_DAYS = _env_int('NOTIFICATION_RETENTION_DAYS', 180)
    SOS_RETENTION_DAYS = _env_int('SOS_RETENTION_DAYS', 365)
    CHAT_RETENTION_DAYS = _env_int('CHAT_RETENTION_DAYS', 365)
    # Same variable as the `backup` service (docker-compose.prod.yml): deleted accounts stay in the backups this long.
    BACKUP_KEEP_DAYS = _env_int('BACKUP_KEEP_DAYS', 14)

    # --- ANDROID APP (phase 7) ---
    # Push notifications (Firebase Cloud Messaging): service account key file; empty or missing = no pushes.
    FCM_SERVICE_ACCOUNT_FILE = os.environ.get('FCM_SERVICE_ACCOUNT_FILE', '').strip()
    # Push tokens the app has not confirmed for this many days are deleted by `flask ror purge-expired`.
    PUSH_TOKEN_STALE_DAYS = _env_int('PUSH_TOKEN_STALE_DAYS', 60)
    # App Links (/.well-known/assetlinks.json): package name and SHA-256 fingerprints (comma-separated)
    # of the certificates that sign the APK; without fingerprints the file is not served.
    ANDROID_APP_ID = os.environ.get('ANDROID_APP_ID', 'com.ror.rider').strip()
    ANDROID_CERT_SHA256 = [f.strip().upper() for f in os.environ.get('ANDROID_CERT_SHA256', '').split(',') if f.strip()]

    # Safe retrieval and construction of the SQLAlchemy URI using psycopg (psycopg3)
    _raw_db_url = (
        os.environ.get('SQLALCHEMY_DATABASE_URI')
        or os.environ.get('DATABASE_URL')
    )
    if _raw_db_url:
        if _raw_db_url.startswith('postgres://'):
            _raw_db_url = _raw_db_url.replace('postgres://', 'postgresql+psycopg://', 1)
        elif _raw_db_url.startswith('postgresql://') and not _raw_db_url.startswith('postgresql+'):
            _raw_db_url = _raw_db_url.replace('postgresql://', 'postgresql+psycopg://', 1)
        SQLALCHEMY_DATABASE_URI = _raw_db_url
    else:
        SQLALCHEMY_DATABASE_URI = (
            f"postgresql+psycopg://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
        )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = engine_options(SQLALCHEMY_DATABASE_URI)

    # --- FLASK-SECURITY CONFIGURATIONS ---
    # Only the core (sessions, password hashing, roles): the Flask-Security HTML views are not
    # registered, login and registration go through /api/auth/* (see app/__init__.py).
    # Native username management for login and registration
    SECURITY_USERNAME_ENABLE = True
    SECURITY_USERNAME_REQUIRED = True
    SECURITY_USER_IDENTITY_ATTRIBUTES = [  # noqa: RUF012
            {"email": {"case_insensitive": True}},
            {"username": {"case_insensitive": True}}
        ]
    SECURITY_PASSWORD_HASH = 'bcrypt'  # Recommended hashing type

    # --- COOKIE AND SESSION SECURITY (HARDENING) ---
    # Prevents JavaScript from reading session cookies (protection against XSS attacks)
    SESSION_COOKIE_HTTPONLY = True
    REMEMBER_COOKIE_HTTPONLY = True
    
    # Prevents cookies from being sent in cross-site contexts (protection against CSRF attacks)
    SESSION_COOKIE_SAMESITE = 'Lax'  # Options: 'Strict', 'Lax', 'None' (if using 'None', ensure HTTPS is used)
    
    # Enables CSRF protection on all WTForms forms
    WTF_CSRF_ENABLED = True
    # The React SPA keeps the token in memory for the whole session and sends it
    # in the X-CSRFToken header, so it must not expire after one hour.
    WTF_CSRF_TIME_LIMIT = None

    # Reject oversized request bodies (profile photos are resized client-side).
    MAX_CONTENT_LENGTH = 5 * 1024 * 1024

    # Group chat WebSocket (app/realtime.py). A ping every 25 s closes the connections whose phone is gone
    # (no coverage, new IP): before, they held a server thread and one of the 5 chats of the account for hours.
    # A message is at most 1000 characters: the limit stops a single 200 MB message from taking 400 MB of RAM.
    SOCK_SERVER_OPTIONS = {'ping_interval': 25, 'max_message_size': 64 * 1024}  # noqa: RUF012

    SESSION_COOKIE_SECURE = _env_bool('SESSION_COOKIE_SECURE', True)
    REMEMBER_COOKIE_SECURE = _env_bool('REMEMBER_COOKIE_SECURE', True)
