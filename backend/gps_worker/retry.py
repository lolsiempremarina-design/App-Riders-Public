"""Delay before a message that failed for a transient reason goes back to the queue.

Before, it went back at once: with PostgreSQL restarting, every message failed and came back immediately,
thousands of times a minute, each with a full stack trace in the log. The delay grows with the failures in
a row and starts again from the first after a success. Kept apart from worker_consumer.py so that it can
be tested without pika (the backend tests run in the web container).
"""

RETRY_BASE_SEC = 1.0
RETRY_MAX_SEC = 30.0


def transient_retry_delay(consecutive_failures: int) -> float:
    """1, 2, 4, 8, 16, then 30 seconds."""
    if consecutive_failures < 1:
        return RETRY_BASE_SEC
    # capped exponent: after ~1100 failures in a row (half an hour of outage) 2**n would overflow a float
    return min(RETRY_MAX_SEC, RETRY_BASE_SEC * 2 ** min(consecutive_failures - 1, 10))
