import logging
import os
import subprocess
import sys
import time
import urllib.request

import pytest

logger = logging.getLogger(__name__)

STARTUP_TIMEOUT_SEC = 20


def test_wsgi_server_starts():
    """`python wsgi.py` serves the app on port 8080 (Docker uses Gunicorn with the same wsgi:app)."""
    env = os.environ.copy()
    env["FLASK_DEBUG"] = "False"
    # Set testing env vars for safety so it doesn't connect to production DB
    env["SQLALCHEMY_DATABASE_URI"] = "sqlite:///:memory:"
    env["SECRET_KEY"] = "test-secret-key"
    env["SECURITY_PASSWORD_SALT"] = "test-password-salt"
    env["SESSION_COOKIE_SECURE"] = "false"

    process = subprocess.Popen(
        [sys.executable, "wsgi.py"],
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE
    )

    # Wait until it answers: a fixed 2 s pause failed when the machine was busy (the app needs ~1.5 s to start)
    status = None
    deadline = time.monotonic() + STARTUP_TIMEOUT_SEC
    try:
        while status is None and time.monotonic() < deadline:
            if process.poll() is not None:
                _, stderr = process.communicate()
                logger.error("wsgi.py exited. Stderr: %s", stderr.decode())
                pytest.fail("wsgi.py failed to start.")
            try:
                status = urllib.request.urlopen("http://localhost:8080/api/health", timeout=2).status
            except OSError:
                time.sleep(0.2)
    finally:
        process.terminate()
        process.wait(timeout=5)

    assert status == 200, f"No answer from wsgi.py within {STARTUP_TIMEOUT_SEC} s."
