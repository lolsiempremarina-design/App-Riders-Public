"""Ingestion API: receives telemetry from the client and publishes it to RabbitMQ (no DB persistence)."""
import json
import logging
import os
import time
from threading import Lock, Thread
from typing import Annotated
from uuid import UUID

import pika
import requests
from fastapi import Body, FastAPI, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

RABBITMQ_HOST = os.getenv("RABBITMQ_HOST", "rabbitmq")
RABBITMQ_PORT = int(os.getenv("RABBITMQ_PORT", "5672"))
RABBITMQ_USER = os.getenv("RABBITMQ_USER", "guest")
RABBITMQ_PASSWORD = os.getenv("RABBITMQ_PASSWORD", "guest")
RABBITMQ_QUEUE = os.getenv("RABBITMQ_QUEUE", "telemetry_stream")
# Above its disk or memory thresholds (backend/rabbitmq/20-ror.conf) RabbitMQ blocks publishers. Without a limit
# basic_publish waited forever holding the lock: every later /stream queued behind it and the phone hung.
# Now the request gets a 503 after 10 s and the app keeps the points for its next attempt.
RABBITMQ_BLOCKED_TIMEOUT_SEC = float(os.getenv("RABBITMQ_BLOCKED_TIMEOUT_SEC", "10"))

app = FastAPI(title="Sensor Ingest API")


class TelemetryPoint(BaseModel):
    """Single payload accepted from the client: no raw sensor data is forwarded to the server."""

    model_config = ConfigDict(extra="forbid")

    session_id: UUID
    lat: float | None = Field(default=None, ge=-90, le=90)
    lon: float | None = Field(default=None, ge=-180, le=180)
    speed_kmh: float | None = Field(default=None, ge=0)
    timestamp: float = Field(gt=0)
    is_confirmed_fall: bool = False
    is_cancelled_fall: bool = False


class SessionEnd(BaseModel):
    """Signals the closure of a tracking session: triggers the GPX file close."""

    model_config = ConfigDict(extra="forbid")

    session_id: UUID


class RabbitMQPublisher:
    """Persistent connection to RabbitMQ with automatic reconnection on error."""

    def __init__(self) -> None:
        self._connection: pika.BlockingConnection | None = None
        self._channel = None
        self._lock = Lock()

    def _connect(self) -> None:
        credentials = pika.PlainCredentials(RABBITMQ_USER, RABBITMQ_PASSWORD)
        params = pika.ConnectionParameters(
            host=RABBITMQ_HOST,
            port=RABBITMQ_PORT,
            credentials=credentials,
            heartbeat=30,
            blocked_connection_timeout=RABBITMQ_BLOCKED_TIMEOUT_SEC,
        )
        self._connection = pika.BlockingConnection(params)
        self._channel = self._connection.channel()
        self._channel.queue_declare(queue=RABBITMQ_QUEUE, durable=True)
        # Publisher confirms: basic_publish returns only once RabbitMQ has taken the message. Before, it returned
        # as soon as the bytes were in the TCP buffer, so the 200 of /stream made the phone delete points that a
        # connection dropped right after could still lose. It is also what makes RABBITMQ_BLOCKED_TIMEOUT_SEC
        # work: a blocked broker does not confirm.
        self._channel.confirm_delivery()
        logger.info("Connected to RabbitMQ (%s:%s), queue '%s' ready.", RABBITMQ_HOST, RABBITMQ_PORT, RABBITMQ_QUEUE)

    def publish(self, body: bytes) -> None:
        # pika.BlockingConnection is not thread-safe. FastAPI executes sync
        # handlers in a thread pool, so all connection access must be serialized.
        with self._lock:
            if self._connection is None or self._connection.is_closed:
                self._connect()
            try:
                self._channel.basic_publish(
                    exchange="",
                    routing_key=RABBITMQ_QUEUE,
                    body=body,
                    properties=pika.BasicProperties(delivery_mode=2, content_type="application/json"),
                )
            except pika.exceptions.ConnectionBlockedTimeout:
                # broker above a threshold: retrying now would block for another 10 s. Error, so a 503.
                logger.warning("RabbitMQ is blocking publishers (disk or memory alarm): request refused.")
                self._connection = None
                raise
            except pika.exceptions.AMQPError:
                logger.warning("RabbitMQ connection lost, reconnecting...")
                self._connect()
                self._channel.basic_publish(
                    exchange="",
                    routing_key=RABBITMQ_QUEUE,
                    body=body,
                    properties=pika.BasicProperties(delivery_mode=2, content_type="application/json"),
                )

    def keep_alive(self, every_sec: float = 10.0) -> None:
        """Answers RabbitMQ's heartbeats while no point arrives (a thread, every 10 s). Before, the broker closed
        the idle connection after 60 s ("missed heartbeats" in its log) and the first points of every ride went
        through an error and a reconnection (no point lost, but errors in both logs)."""
        while True:
            time.sleep(every_sec)
            with self._lock:
                if self._connection is None or not self._connection.is_open:
                    continue
                try:
                    self._connection.process_data_events(time_limit=0)
                except pika.exceptions.AMQPError:
                    logger.warning("RabbitMQ connection lost while idle: a new one at the next publish")
                    self._connection = None


publisher = RabbitMQPublisher()
Thread(target=publisher.keep_alive, name="rabbitmq-heartbeat", daemon=True).start()


def verify_flask_session(request: Request):
    """Verifies the Flask session cookie by calling the internal auth endpoint.

    401 only when Flask answers that the session is not valid: the app then sends the rider to the
    login. If Flask cannot answer (slow, restarting) it is a 503, and the app keeps the points and
    retries instead of pausing the ride and logging the rider out.
    """
    cookies = request.headers.get("cookie", "")
    cookie_dict = {}
    for part in cookies.split(";"):
        if "=" in part:
            k, v = part.strip().split("=", 1)
            cookie_dict[k] = v
    # also the "remember me" cookie: when the app restarts during a ride the session cookie is gone and the
    # first request can be /stream; before, Flask answered "not logged in" and the app sent the rider to the
    # login although the account was remembered (the API would have logged it in again with that cookie)
    forwarded = {name: cookie_dict[name] for name in ("session", "remember_token") if cookie_dict.get(name)}
    try:
        resp = requests.get(
            "http://web:8000/auth/check_session",
            cookies=forwarded,
            timeout=5,
        )
        data = resp.json() if resp.status_code in (200, 401) else None
    except (requests.RequestException, ValueError):
        logger.warning("Session check unavailable", exc_info=True)
        data = None
    if data is None:
        raise HTTPException(status_code=503, detail="Session check temporarily unavailable")
    if resp.status_code == 200 and data.get("authenticated"):
        return data
    raise HTTPException(status_code=401, detail="Invalid or missing session")


@app.get("/healthz")
def healthz():
    return {"status": "ok"}


@app.post("/stream")
def handle_stream(
    points: Annotated[list[TelemetryPoint], Body(max_length=200)], request: Request
):
    session = verify_flask_session(request)
    if not session.get("sensors_enabled"):
        raise HTTPException(status_code=403, detail="Sensor access is disabled")
    if not points:
        return {"status": "ok", "count": 0}

    auth_user_id = str(session.get("user_id"))

    try:
        for point in points:
            envelope = {
                "type": "point",
                "user_id": auth_user_id,
                **point.model_dump(mode="json"),
            }
            publisher.publish(json.dumps(envelope).encode("utf-8"))
    except Exception as exc:
        logger.error("Error publishing to RabbitMQ: %s", exc)
        raise HTTPException(status_code=503, detail="Unable to forward data to RabbitMQ") from exc

    return {"status": "ok", "count": len(points)}


@app.post("/session/end")
def handle_session_end(payload: SessionEnd, request: Request):
    """Signals the GPS worker to close the buffer, apply RDP and export the final .gpx file."""
    session = verify_flask_session(request)
    auth_user_id = str(session.get("user_id"))
    try:
        envelope = {
            "type": "session_end",
            "user_id": auth_user_id,
            **payload.model_dump(mode="json"),
        }
        publisher.publish(json.dumps(envelope).encode("utf-8"))
    except Exception as exc:
        logger.error("Error publishing session end to RabbitMQ: %s", exc)
        raise HTTPException(status_code=503, detail="Unable to forward session end to RabbitMQ") from exc

    return {"status": "ok"}
