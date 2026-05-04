# app/cache.py
# Simple in-memory cache for frequently accessed endpoints.
#
# Why caching? Some endpoints (like admin dashboard) run 4-5 database
# aggregation queries every time they are called. With many users refreshing
# the page, this is expensive. Caching stores the result for a short time
# (e.g., 5 minutes) and returns it instantly without hitting the database.
#
# This uses Python's built-in dict — no Redis required.
# For production with multiple server workers, switch to Redis.

import time
from typing import Any, Optional

# The cache store: { key: (value, expiry_timestamp) }
_cache: dict = {}


def get_cached(key: str) -> Optional[Any]:
    """
    Retrieve a cached value by key.

    Returns the cached value if it exists and has not expired.
    Returns None if the key is missing or the value has expired.

    Example:
        result = get_cached("admin_dashboard")
        if result:
            return result  # skip the database queries
    """
    entry = _cache.get(key)
    if entry is None:
        return None
    value, expiry = entry
    if time.time() > expiry:
        # Expired — remove it and return None
        del _cache[key]
        return None
    return value


def set_cached(key: str, value: Any, ttl_seconds: int = 300) -> None:
    """
    Store a value in the cache.

    Args:
        key        : unique cache key (e.g., "admin_dashboard")
        value      : any Python value (dict, list, etc.)
        ttl_seconds: how long to keep the cache (default 5 minutes)

    Example:
        set_cached("admin_dashboard", result, ttl_seconds=300)
    """
    expiry = time.time() + ttl_seconds
    _cache[key] = (value, expiry)


def invalidate_cache(key: str) -> None:
    """
    Remove a specific key from the cache immediately.
    Call this when the underlying data changes so stale data is not served.

    Example: after a new user registers, call invalidate_cache("admin_dashboard")
    """
    _cache.pop(key, None)


def clear_all_cache() -> None:
    """Remove every cached entry. Useful for testing or admin resets."""
    _cache.clear()
