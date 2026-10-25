from functools import lru_cache
from urllib.parse import urlparse

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    supabase_url: str
    cors_origins: str = "http://localhost:5173"
    max_upload_mb: int = 10
    max_files_per_check: int = 8
    # ClamAV daemon for malware scanning. With no host set, uploads are refused unless
    # ALLOW_UNSCANNED_UPLOADS is true, which is for local development only.
    clamav_host: str | None = None
    clamav_port: int = 3310
    allow_unscanned_uploads: bool = False
    # "development": local machine, API docs on. "demo": a hosted copy without a malware scanner (e.g. a free
    # tier for judging), which may allow unscanned uploads. "production": never allows unscanned uploads.
    environment: str = "development"
    pdf_timeout_seconds: float = 15
    # Photos and scans: OCR on a small shared CPU (e.g. a free host) can take most of a minute.
    ocr_timeout_seconds: float = 90
    api_requests_per_minute: int = 240

    @model_validator(mode="after")
    def safe_for_production(self) -> "Settings":
        if self.environment == "production" and self.allow_unscanned_uploads:
            raise ValueError("ALLOW_UNSCANNED_UPLOADS must not be true when ENVIRONMENT=production")
        return self

    @field_validator("supabase_url")
    @classmethod
    def valid_supabase_url(cls, value: str) -> str:
        value = value.strip()
        parsed = urlparse(value)
        # Supabase shows several addresses; the REST or Auth one pasted by mistake still names the project.
        if parsed.path.rstrip("/") in ("/rest/v1", "/auth/v1"):
            parsed = parsed._replace(path="")
            value = parsed.geturl()
        if (parsed.scheme != "https" or not parsed.netloc or parsed.path not in ("", "/")
                or "your-project" in parsed.netloc):
            raise ValueError("SUPABASE_URL must be an HTTPS project root URL")
        return value.rstrip("/")

    @property
    def allowed_origins(self) -> list[str]:
        origins = [item.strip() for item in self.cors_origins.split(",") if item.strip()]
        if not origins or any(
            origin == "*"
            or urlparse(origin).scheme not in ("http", "https")
            or not urlparse(origin).netloc
            or urlparse(origin).path not in ("", "/")
            for origin in origins
        ):
            raise ValueError("CORS_ORIGINS must contain explicit URL origins")
        return origins


@lru_cache
def get_settings() -> Settings:
    return Settings()
