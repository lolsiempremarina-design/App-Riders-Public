"""RabbitMQ Consumer: feeds the GPXStreamManager and records track metadata to PostgreSQL."""
import json
import logging
import os
import threading
import time

import pika
import psycopg
import redis
from heartbeat import (
    HEARTBEAT_SEC,
    WATCHDOG_TIMEOUT_SEC,
    heartbeat_age,
    touch_heartbeat,
    watchdog_should_quit,
)
from retry import transient_retry_delay
from stream_manager import DEFAULT_PAUSE_GAP_SEC, GPXStreamManager, SessionSummary, valid_timestamp

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

RABBITMQ_HOST = os.getenv("RABBITMQ_HOST", "rabbitmq")
RABBITMQ_PORT = int(os.getenv("RABBITMQ_PORT", "5672"))
RABBITMQ_USER = os.getenv("RABBITMQ_USER", "guest")
RABBITMQ_PASSWORD = os.getenv("RABBITMQ_PASSWORD", "guest")
RABBITMQ_QUEUE = os.getenv("RABBITMQ_QUEUE", "telemetry_stream")

DB_HOST = os.getenv("DB_HOST", "postgres")
DB_PORT = int(os.getenv("DB_PORT", "5432"))
DB_NAME = os.getenv("DB_NAME", "sensor_app")
DB_USER = os.getenv("DB_USER", "sensor_app")
DB_PASSWORD = os.getenv("DB_PASSWORD", "sensor_app")

OUTPUT_BASE_DIR = os.getenv("OUTPUT_BASE_DIR", "/data/volume_gpx_storage")
RDP_EPSILON = float(os.getenv("RDP_EPSILON", "0.00004"))
PAUSE_GAP_SEC = float(os.getenv("PAUSE_GAP_SEC", str(DEFAULT_PAUSE_GAP_SEC)))

REDIS_HOST = os.getenv("REDIS_HOST", "redis")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))
POSITION_TTL = int(os.getenv("POSITION_TTL", "90"))

# The proof of life (heartbeat.py) is written from inside pika's I/O loop, so it goes stale exactly
# when the worker stops processing messages.

# A database that does not answer used to leave on_message waiting with no limit (the watchdog is the last
# resort): now it is an error after these seconds, and the message is retried later like any transient one.
DB_CONNECT_TIMEOUT_SEC = int(os.getenv("DB_CONNECT_TIMEOUT_SEC", "10"))
DB_STATEMENT_TIMEOUT_MS = int(os.getenv("DB_STATEMENT_TIMEOUT_MS", "30000"))

redis_client = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True,
                           socket_connect_timeout=5, socket_timeout=5)

stream_mgr = GPXStreamManager(output_base_dir=OUTPUT_BASE_DIR, pause_gap_sec=PAUSE_GAP_SEC)

# consecutive transient failures: the delay before the next retry grows with them (retry.py)
transient_failures = 0


def get_db_conn():
    return psycopg.connect(
        host=DB_HOST, port=DB_PORT, dbname=DB_NAME, user=DB_USER, password=DB_PASSWORD,
        connect_timeout=DB_CONNECT_TIMEOUT_SEC,
        # UTC like the web app (config.engine_options): to_timestamp() of fall_events and now() of
        # rider_shifts.created_at are converted with the session time zone
        options=f"-c statement_timeout={DB_STATEMENT_TIMEOUT_MS} -c timezone=UTC",
    )


def save_shift_metadata(session_id: str, user_id: str, summary: SessionSummary) -> None:
    """Upsert the closed session; started_at/ended_at are the first and last GPS points (naive UTC,
    like the ORM): the time between them that is not moving time (duration_min) is pauses.

    The route is credited to the bike the rider has linked when the session closes.
    """
    with get_db_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO rider_shifts (session_id, user_id, gpx_path, total_distance_km, duration_min,
                                      started_at, ended_at, bike_id)
            VALUES (%s, %s, %s, %s, %s, to_timestamp(%s) AT TIME ZONE 'UTC', to_timestamp(%s) AT TIME ZONE 'UTC',
                    (SELECT id FROM bikes WHERE user_id = %s))
            ON CONFLICT (user_id, session_id) DO UPDATE SET
                gpx_path = EXCLUDED.gpx_path,
                total_distance_km = EXCLUDED.total_distance_km,
                duration_min = EXCLUDED.duration_min,
                started_at = EXCLUDED.started_at,
                ended_at = EXCLUDED.ended_at,
                bike_id = EXCLUDED.bike_id
            """,
            (session_id, user_id, summary.gpx_path, summary.distance_km, summary.duration_min,
             summary.started_ms / 1000.0, summary.ended_ms / 1000.0, int(user_id)),
        )


def saved_route(session_id: str, user_id: str) -> SessionSummary | None:
    """The route already saved for this session (an earlier end), None if there is none."""
    with get_db_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT gpx_path, total_distance_km, duration_min,
                   EXTRACT(EPOCH FROM started_at) * 1000, EXTRACT(EPOCH FROM ended_at) * 1000
            FROM rider_shifts WHERE user_id = %s AND session_id = %s
            """,
            (int(user_id), session_id),
        )
        row = cur.fetchone()
    if row is None or row[3] is None or row[4] is None:
        return None  # older rows without the time of their first and last point
    return SessionSummary(row[0], float(row[1] or 0), float(row[2] or 0), float(row[3]), float(row[4]))


def save_fall_event(session_id: str, user_id: str, lat: float | None, lon: float | None, timestamp_ms: float) -> None:
    """Persists a confirmed fall to Postgres (table fall_events)."""
    if lat is None or lon is None:
        logger.warning(
            "Confirmed fall without valid GPS coordinates, not saved (user=%s session=%s)",
            user_id, session_id,
        )
        return
    with get_db_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO fall_events (session_id, user_id, latitude, longitude, "timestamp")
            VALUES (%s, %s, %s, %s, to_timestamp(%s))
            ON CONFLICT (user_id, session_id, "timestamp") DO NOTHING
            """,
            (session_id, user_id, lat, lon, timestamp_ms / 1000.0),
        )


def on_message(channel, method, properties, body: bytes) -> None:
    global transient_failures  # noqa: PLW0603 - one counter for the whole consumer
    try:
        envelope = json.loads(body)
        if not isinstance(envelope, dict):
            # e.g. a JSON list: .get() raised AttributeError, taken as transient and retried forever
            raise TypeError("The message is not a JSON object")
        msg_type = envelope.get("type")

        if msg_type == "point":
            if not valid_timestamp(envelope["timestamp"]):
                # acknowledged and dropped: retrying a point that can never be saved would loop forever
                logger.warning("Point discarded: invalid time %r (user=%s session=%s)",
                               envelope["timestamp"], envelope.get("user_id"), envelope.get("session_id"))
                channel.basic_ack(delivery_tag=method.delivery_tag)
                return
            if envelope.get("is_confirmed_fall"):
                save_fall_event(
                    session_id=envelope["session_id"],
                    user_id=envelope["user_id"],
                    lat=envelope.get("lat"),
                    lon=envelope.get("lon"),
                    timestamp_ms=envelope["timestamp"],
                )
            stream_mgr.add_point(
                session_id=envelope["session_id"],
                user_id=envelope["user_id"],
                lat=envelope.get("lat"),
                lon=envelope.get("lon"),
                elev=None,
                timestamp=envelope["timestamp"],
            )
            if envelope.get("lat") is not None and envelope.get("lon") is not None:
                try:
                    redis_client.set(
                        f"position:{envelope['user_id']}",
                        json.dumps({
                            "lat": envelope["lat"],
                            "lon": envelope["lon"],
                            "session_id": envelope["session_id"],
                            "ts": envelope["timestamp"],
                        }),
                        ex=POSITION_TTL,
                    )
                except redis.RedisError:
                    logger.exception("Unable to update the live-position cache.")
        elif msg_type == "session_end":
            result = stream_mgr.close_session(
                session_id=envelope["session_id"],
                user_id=envelope["user_id"],
                apply_rdp=True,
                epsilon=RDP_EPSILON,
                # the app may resume a session already closed: the new points are added to its route
                previous=saved_route(envelope["session_id"], envelope["user_id"]),
            )
            if result is not None:
                final_path = result.gpx_path
                try:
                    save_shift_metadata(envelope["session_id"], envelope["user_id"], result)
                except psycopg.errors.IntegrityError:
                    # Permanent failure (e.g. the user deleted the account meanwhile): retrying
                    # would loop forever, so drop the orphan GPX file and complete the session.
                    logger.exception("Shift metadata rejected for user=%s session=%s; GPX discarded.",
                                     envelope["user_id"], envelope["session_id"])
                    try:
                        os.remove(final_path)
                    except OSError:
                        logger.warning("Unable to remove orphan GPX %s", final_path)
            try:
                redis_client.delete(f"position:{envelope['user_id']}")
            except redis.RedisError:
                logger.exception("Unable to clear the live-position cache.")
            stream_mgr.complete_session(envelope["session_id"], envelope["user_id"])
        else:
            raise ValueError(f"Unknown message type: {msg_type}")

    except (json.JSONDecodeError, KeyError, TypeError, ValueError, OverflowError,
            psycopg.errors.IntegrityError, psycopg.DataError):
        # permanent: the same message would fail again at every retry
        logger.exception("Invalid message rejected without retry.")
        channel.basic_reject(delivery_tag=method.delivery_tag, requeue=False)
    except Exception:
        transient_failures += 1
        delay = transient_retry_delay(transient_failures)
        if transient_failures == 1:
            logger.exception("Transient processing error; message requeued in %.0fs.", delay)
        else:  # the same outage again: one line instead of the full stack trace
            logger.warning("Transient processing error (%d in a row); message requeued in %.0fs.",
                           transient_failures, delay)
        # The nack is delayed with a timer of the I/O loop, not with sleep: heartbeats and the other messages
        # keep going, and the proof of life of heartbeat.py stays fresh (the worker is not stuck, only waiting).
        tag = method.delivery_tag
        channel.connection.call_later(delay, lambda: channel.basic_nack(delivery_tag=tag, requeue=True))
    else:
        transient_failures = 0
        channel.basic_ack(delivery_tag=method.delivery_tag)


def schedule_heartbeat(connection) -> None:
    """Keep touching the file every HEARTBEAT_SEC for as long as the I/O loop runs."""
    touch_heartbeat()
    connection.call_later(HEARTBEAT_SEC, lambda: schedule_heartbeat(connection))


def watchdog() -> None:
    """Quit when the worker stops processing, so that Docker's restart policy takes over.

    A worker stuck inside on_message (a query that never answers, a lock never released) keeps
    its process alive: `restart` only reacts to a process that exits, so without this the points
    of every rider pile up in the queue and no route is saved, silently. This thread is separate
    from the I/O loop, so it still runs while that loop is blocked.
    """
    while True:
        time.sleep(HEARTBEAT_SEC)
        age = heartbeat_age()
        if watchdog_should_quit(age, WATCHDOG_TIMEOUT_SEC):
            logger.error("No progress for %.0fs (limit %ss): quitting so the container restarts.",
                         age, WATCHDOG_TIMEOUT_SEC)
            os._exit(1)  # the I/O loop is stuck: a clean shutdown would hang too


def run() -> None:
    credentials = pika.PlainCredentials(RABBITMQ_USER, RABBITMQ_PASSWORD)
    params = pika.ConnectionParameters(
        host=RABBITMQ_HOST, port=RABBITMQ_PORT, credentials=credentials, heartbeat=30
    )

    touch_heartbeat()
    threading.Thread(target=watchdog, daemon=True, name="watchdog").start()

    while True:
        try:
            connection = pika.BlockingConnection(params)
            channel = connection.channel()
            channel.queue_declare(queue=RABBITMQ_QUEUE, durable=True)
            channel.basic_qos(prefetch_count=20)
            channel.basic_consume(queue=RABBITMQ_QUEUE, on_message_callback=on_message)
            schedule_heartbeat(connection)

            logger.info("GPS Worker listening on queue '%s'...", RABBITMQ_QUEUE)
            channel.start_consuming()
        except pika.exceptions.AMQPConnectionError:
            # waiting for the broker is progress too: without this the watchdog would quit
            # during a RabbitMQ restart, when there is nothing wrong with the worker
            touch_heartbeat()
            logger.warning("RabbitMQ unreachable, retrying in 5s...")
            time.sleep(5)
        except KeyboardInterrupt:
            logger.info("Interrupt requested, shutting down worker.")
            break


if __name__ == "__main__":
    run()
