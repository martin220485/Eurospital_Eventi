"""Sliding-window rate limiter backed by Redis.

Fail-open if Redis is unreachable (logs warning).
"""
import logging
import time
import uuid

logger = logging.getLogger(__name__)


def check_and_increment(redis_client, *, key: str, max_count: int, window_seconds: int) -> bool:
    """Return True if the request is allowed, False if over the limit.

    Uses a Redis ZSET keyed by timestamp_ms with random member; entries
    older than the window are removed before the count is taken.
    """
    if redis_client is None:
        return True
    try:
        now_ms = int(time.time() * 1000)
        cutoff = now_ms - window_seconds * 1000
        pipe = redis_client.pipeline()
        pipe.zremrangebyscore(key, 0, cutoff)
        pipe.zadd(key, {f"{now_ms}-{uuid.uuid4().hex}": now_ms})
        pipe.zcard(key)
        pipe.expire(key, window_seconds + 5)
        _, _, count, _ = pipe.execute()
        return int(count) <= max_count
    except Exception as exc:  # broker down or network error
        logger.warning("rate limit check failed (fail-open): %s", exc)
        return True
