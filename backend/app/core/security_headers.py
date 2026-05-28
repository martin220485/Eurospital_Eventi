from starlette.middleware.base import BaseHTTPMiddleware


_CSP = (
    "default-src 'self'; "
    "img-src 'self' data:; "
    "style-src 'self' 'unsafe-inline'; "
    "script-src 'self'; "
    "frame-ancestors 'none'"
)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        h = response.headers
        h["X-Content-Type-Options"] = "nosniff"
        h["X-Frame-Options"] = "DENY"
        h["Referrer-Policy"] = "strict-origin-when-cross-origin"
        h["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
        h.setdefault("Content-Security-Policy", _CSP)
        return response


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Apply sliding-window rate limit to selected paths.

    `paths` is a list of (path_prefix, identifier_callable) tuples; identifier
    receives the Request and returns a string used in the Redis key.
    """

    def __init__(self, app, *, redis_client, max_count: int, window_seconds: int, paths: list):
        super().__init__(app)
        self._redis = redis_client
        self._max = max_count
        self._window = window_seconds
        self._paths = paths

    async def dispatch(self, request, call_next):
        from fastapi.responses import JSONResponse

        from app.core.rate_limit import check_and_increment

        path = request.url.path
        scope = None
        ident = None
        for prefix, ident_fn in self._paths:
            if path.startswith(prefix):
                scope = prefix
                try:
                    ident = await ident_fn(request) if hasattr(ident_fn, "__await__") else ident_fn(request)
                except Exception:
                    ident = "_err_"
                break
        if scope is not None and ident is not None:
            ip = request.headers.get("x-forwarded-for", "").split(",")[0].strip() or (
                request.client.host if request.client else ""
            )
            key = f"rl:{scope}:{ip}:{ident}"
            if not check_and_increment(
                self._redis, key=key, max_count=self._max, window_seconds=self._window
            ):
                return JSONResponse(
                    {"detail": "Troppi tentativi. Riprova tra qualche minuto."},
                    status_code=429,
                    headers={"Retry-After": str(self._window)},
                )
        return await call_next(request)
