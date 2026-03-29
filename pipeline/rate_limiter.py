import asyncio
import time


class RateLimiter:
    """Async token-bucket rate limiter with adaptive backoff on 429s."""

    def __init__(self, requests_per_second: int = 30):
        self.rate = requests_per_second
        self.tokens = float(requests_per_second)
        self.max_tokens = float(requests_per_second)
        self.last_refill = time.monotonic()
        self.backoff_until = 0.0
        self.consecutive_429s = 0
        self._lock = asyncio.Lock()

    async def acquire(self):
        """Wait until a request token is available."""
        async with self._lock:
            now = time.monotonic()

            # Wait out backoff period
            if now < self.backoff_until:
                wait = self.backoff_until - now
                await asyncio.sleep(wait)
                now = time.monotonic()

            # Refill tokens
            elapsed = now - self.last_refill
            self.tokens = min(self.max_tokens, self.tokens + elapsed * self.rate)
            self.last_refill = now

            # Wait if no tokens
            if self.tokens < 1:
                wait = (1.0 - self.tokens) / self.rate
                await asyncio.sleep(wait)
                self.tokens = 0.0
            else:
                self.tokens -= 1.0

    def on_429(self):
        """Called when a 429 response is received. Increases backoff."""
        self.consecutive_429s += 1
        backoff = min(2 ** self.consecutive_429s, 60)
        self.backoff_until = time.monotonic() + backoff

    def on_success(self):
        """Called on a successful response. Resets backoff."""
        self.consecutive_429s = 0
