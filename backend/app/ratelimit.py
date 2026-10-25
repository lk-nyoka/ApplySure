import threading
import time
from collections import defaultdict, deque
from typing import Annotated

from fastapi import Depends, HTTPException

from .auth import CurrentUser, require_user


class RateLimit:
    """Per-user sliding window, in memory. Enough for one API process; use a shared store if scaled out."""

    def __init__(self, limit: int, window_seconds: float, clock=time.monotonic):
        self.limit, self.window, self._clock = limit, window_seconds, clock
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def __call__(self, user: Annotated[CurrentUser, Depends(require_user)]) -> CurrentUser:
        now = self._clock()
        with self._lock:
            hits = self._hits[str(user.id)]
            while hits and hits[0] <= now - self.window:
                hits.popleft()
            if len(hits) >= self.limit:
                raise HTTPException(status_code=429, detail="Too many requests. Please wait a minute and try again.")
            hits.append(now)
        return user


upload_limit = RateLimit(limit=20, window_seconds=60)
