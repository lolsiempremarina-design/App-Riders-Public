import importlib.util
import logging
from datetime import date
from pathlib import Path

import pytest
from sqlalchemy.pool import StaticPool

from app import create_app
from app.auth.models import user_datastore
from config import Config
from extensions import db


class TestConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = 'sqlite:///:memory:' # Use in-memory SQLite for testing
    SQLALCHEMY_ENGINE_OPTIONS = {  # noqa: RUF012
        'poolclass': StaticPool,
        'connect_args': {'check_same_thread': False}
    }
    WTF_CSRF_ENABLED = False
    SECURITY_PASSWORD_HASH = 'plaintext'
    SESSION_COOKIE_SECURE = False
    REMEMBER_COOKIE_SECURE = False
    # never contact Firebase from the tests, even when the container has the real key mounted;
    # App Links and privacy controller as without configuration (the local .env may contain real values)
    FCM_SERVICE_ACCOUNT_FILE = ''
    ANDROID_APP_ID = 'com.ror.rider'
    ANDROID_CERT_SHA256 = []  # noqa: RUF012
    PRIVACY_CONTROLLER_NAME = ''
    PRIVACY_CONTACT_EMAIL = ''
    # never send real emails from the tests, even when the local .env has the Gmail account of the SOS emails
    MAIL_SERVER = ''
    MAIL_USERNAME = ''
    MAIL_PASSWORD = ''
    MAIL_FROM = ''

@pytest.fixture
def app():
    """Create an isolated application and database for each test."""
    app = create_app(TestConfig)

    with app.app_context():
        db.create_all()
        if not user_datastore.find_role('admin'):
            user_datastore.create_role(name='admin', description='Admin Role')
        db.session.commit()

    yield app

    with app.app_context():
        db.session.remove()
        db.drop_all()

@pytest.fixture
def client(app):
    """A test client for the app."""
    return app.test_client()

@pytest.fixture
def runner(app):
    """A test runner for the app's cli commands."""
    return app.test_cli_runner()


@pytest.fixture
def user_factory():
    """Create valid users with all mandatory profile fields."""
    def create_user(email, username, **overrides):
        defaults = {
            'email': email,
            'username': username,
            'password': 'password',
            'tax_id_code': f'{username.upper():0<16}'[:16],
            'full_name': username.replace('_', ' ').title(),
            'date_of_birth': date(1990, 1, 1),
            'gender': 'M',
            'birth_city_country': 'Rome',
        }
        defaults.update(overrides)
        return user_datastore.create_user(**defaults)

    return create_user

WORKER_DIR = Path(__file__).resolve().parents[1] / 'gps_worker'


@pytest.fixture(scope='module')
def consumer(tmp_path_factory):
    """The GPS worker module (gps_worker/worker_consumer.py), with its GPX folder in a temporary directory."""
    with pytest.MonkeyPatch.context() as mp:
        mp.setenv('OUTPUT_BASE_DIR', str(tmp_path_factory.mktemp('gpx_import')))
        mp.syspath_prepend(str(WORKER_DIR))
        spec = importlib.util.spec_from_file_location('ror_worker_consumer', WORKER_DIR / 'worker_consumer.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
    return module

@pytest.fixture(autouse=True)
def setup_logging(request):
    """Fixture to ensure logging happens for each test."""
    logger = logging.getLogger(request.node.name)
    
    # Recupera la descrizione iniziale del test (il suo docstring)
    description = request.node.function.__doc__
    if description:
        logger.info(f"Starting test: {request.node.name} - Descrizione: {description.strip()}")
    else:
        logger.info(f"Starting test: {request.node.name}")
        
    yield
    logger.info(f"Finished test: {request.node.name}")
