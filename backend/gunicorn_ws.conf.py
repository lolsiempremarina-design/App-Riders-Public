"""Gunicorn of the "ws" service (group chat, see docker-compose.yml): gunicorn -c gunicorn_ws.conf.py ...

The open chats are counted in Redis (limit per account, app/realtime.py): when the service starts none
of them is open any more, so the counts left by the previous process are cleared.
"""
import os

import redis


def on_starting(server):
    from app.realtime import forget_all_sockets  # same image as the app

    client = redis.Redis(host=os.environ.get('REDIS_HOST', 'redis'), port=int(os.environ.get('REDIS_PORT', '6379')),
                         socket_timeout=5)
    try:
        accounts = forget_all_sockets(client)
        server.log.info('Open chats of the previous start cleared (%d accounts).', accounts)
    except redis.RedisError:
        server.log.warning('Redis unavailable: the open chats of the previous start stop counting after 90 s.')
