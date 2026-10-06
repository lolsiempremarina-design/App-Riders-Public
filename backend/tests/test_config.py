"""Configuration helpers."""
from config import engine_options


def test_postgresql_sessions_run_in_utc():
    """The timestamps are stored without a zone and some defaults carry one: PostgreSQL converts them with the
    session time zone, so it must be UTC whatever the database default is (Europe/Rome on an Italian server)."""
    options = engine_options('postgresql+psycopg://ror:secret@db:5432/ror')
    assert options['connect_args'] == {'options': '-c timezone=UTC'}
    assert options['pool_pre_ping'] is True


def test_other_databases_get_no_postgresql_options():
    # sqlite3.connect() would refuse an "options" argument
    assert engine_options('sqlite:///:memory:') == {'pool_pre_ping': True}
