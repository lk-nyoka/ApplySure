import logging
import time
import uuid

from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.formparsers import MultiPartParser

from .config import get_settings
from .ratelimit import RateLimit
from .routes import applications, auth, bursaries, checks, documents
from .services.documents.intake import ScannerUnavailable, clamav_scan

logger = logging.getLogger("applysure")
access_log = logging.getLogger("applysure.access")
if not logger.handlers:  # uvicorn only configures its own loggers; print ours to stdout for the host's log service
    _handler = logging.StreamHandler()
    _handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s"))
    logger.addHandler(_handler)
    logger.setLevel(logging.INFO)
    logger.propagate = False

_SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "no-store",
    "X-Frame-Options": "DENY",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
}


def create_app() -> FastAPI:
    settings = get_settings()
    # API docs only on a developer's machine: on any hosted copy they map the whole attack surface for free.
    local = settings.environment == "development"
    app = FastAPI(title="ApplySure API", docs_url="/docs" if local else None,
                  redoc_url=None, openapi_url="/openapi.json" if local else None)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        allow_headers=["Authorization", "Content-Type"],
        expose_headers=["X-Request-ID"],
    )
    # Keep each uploaded file in memory up to the size limit, so documents never touch the disk.
    MultiPartParser.spool_max_size = settings.max_upload_mb * 1024 * 1024 + 1
    # Whole-request cap: every file at its limit plus room for the form fields.
    max_body = settings.max_files_per_check * settings.max_upload_mb * 1024 * 1024 + 64 * 1024

    @app.middleware("http")
    async def guard(request: Request, call_next):
        request_id = uuid.uuid4().hex[:16]
        started = time.perf_counter()
        headers = {**_SECURITY_HEADERS, "X-Request-ID": request_id}
        length = request.headers.get("content-length")
        if length is not None and (not length.isdigit() or int(length) > max_body):
            return JSONResponse(status_code=413, content={"detail": "Upload is too large"}, headers=headers)
        if request.method == "POST" and length is None:
            return JSONResponse(status_code=411, content={"detail": "Content-Length is required"}, headers=headers)
        try:
            response = await call_next(request)
        except Exception as exc:
            # Log the type only: messages can contain document text or tokens.
            logger.error("request_id=%s unhandled %s on %s %s", request_id, type(exc).__name__, request.method, request.url.path)
            response = JSONResponse(status_code=500, content={"detail": f"Something went wrong. Please try again. (Reference {request_id})"})
        response.headers.update(headers)
        # Path only, never the query string or body: those can carry personal details.
        access_log.info("request_id=%s %s %s %s %.0fms", request_id, request.method, request.url.path,
                        response.status_code, (time.perf_counter() - started) * 1000)
        return response

    @app.exception_handler(RequestValidationError)
    async def validation_error(_request: Request, _exc: RequestValidationError) -> JSONResponse:
        return JSONResponse(status_code=422, content={"detail": "Invalid request"})

    # Also under /api, so the website can wake a sleeping free-tier host through its /api proxy.
    @app.get("/api/health", tags=["health"])
    @app.get("/health", tags=["health"])
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/health/ready", tags=["health"])
    def ready() -> JSONResponse:
        """For the load balancer: ready only when uploads can actually be scanned."""
        if settings.clamav_host:
            try:
                clamav_scan(b"readiness probe", settings.clamav_host, settings.clamav_port, timeout=5)
            except ScannerUnavailable:
                return JSONResponse(status_code=503, content={"status": "scanner unavailable"})
        elif not settings.allow_unscanned_uploads:
            return JSONResponse(status_code=503, content={"status": "no scanner configured"})
        return JSONResponse(content={"status": "ready"})

    # Every API route is per-user rate limited; uploads have their own, stricter limit as well.
    api_limit = RateLimit(limit=settings.api_requests_per_minute, window_seconds=60)
    for router in (auth.router, documents.router, bursaries.router, applications.router, checks.router):
        app.include_router(router, dependencies=[Depends(api_limit)])
    return app


app = create_app()
