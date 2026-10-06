"""Proof of life of the GPS worker, for the Docker healthcheck and the watchdog.

Kept apart from worker_consumer.py so that it can be tested without pika, psycopg or redis:
the backend test suite runs in the web container, which does not have the worker's libraries.
"""
import os
import time

# The file lives in /tmp: it must not survive a restart of the container.
HEARTBEAT_FILE = os.getenv("WORKER_HEARTBEAT_FILE", "/tmp/gps_worker_alive")  # noqa: S108
HEARTBEAT_SEC = int(os.getenv("WORKER_HEARTBEAT_SEC", "30"))
WATCHDOG_TIMEOUT_SEC = int(os.getenv("WORKER_WATCHDOG_TIMEOUT_SEC", "180"))


def touch_heartbeat(path: str = HEARTBEAT_FILE) -> None:
    """Write the proof of life. Called from pika's I/O loop, never from the watchdog thread."""
    try:
        with open(path, "w") as handle:
            handle.write(str(time.time()))
    except OSError:
        # Nothing to do here: a file that stops being updated is exactly what the healthcheck
        # and the watchdog look for, so a disk problem surfaces as an unhealthy container.
        pass


def heartbeat_age(now: float | None = None, path: str = HEARTBEAT_FILE) -> float | None:
    """Seconds since the last proof of life, or None while the file does not exist yet."""
    try:
        return (now if now is not None else time.time()) - os.path.getmtime(path)
    except OSError:
        return None


def watchdog_should_quit(age: float | None, timeout: float = WATCHDOG_TIMEOUT_SEC) -> bool:
    """No file yet (the worker is starting) is not a reason to quit; a stale one is."""
    return age is not None and age > timeout
