FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN python -m pip install --no-cache-dir --upgrade pip==26.2.1 && \
    python -m pip install --no-cache-dir -r requirements.txt

COPY rdp_optimizer.py stream_manager.py heartbeat.py retry.py worker_consumer.py ./

# Same unprivileged user (uid 1000) as the web container: the GPX files it writes can be
# deleted by the web app when a route or an account is deleted.
RUN useradd -m -u 1000 appuser && \
    mkdir -p /data/volume_gpx_storage && \
    chown appuser:appuser /data/volume_gpx_storage
USER appuser

CMD ["python", "worker_consumer.py"]
