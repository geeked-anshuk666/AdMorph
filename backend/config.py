"""
Admorph - Application configuration via pydantic-settings.

All values read from environment variables / .env file.
No secrets in code.
"""

from __future__ import annotations

import pathlib
from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Always resolve .env from the project root (one level above backend/)
_ENV_FILE = pathlib.Path(__file__).parent.parent / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # AI
    google_api_key: str
    gemini_pro_model: str = "gemini-3.1-pro-preview"
    gemini_flash_model: str = "gemini-3-flash-preview"

    # Security
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    jwt_expiry_minutes: int = 60

    # CORS
    allowed_origins: str = "http://localhost:3000"

    # Server
    backend_host: str = "0.0.0.0"
    backend_port: int = 8000
    frontend_url: str = "http://localhost:3000"

    # Rate limiting
    rate_limit_personalize: int = 3
    rate_limit_auth: int = 20

    # Caching
    cache_ttl: int = 3600

    # Fetcher
    fetch_timeout: float = 5.0
    fetch_max_retries: int = 3
    max_upload_size_mb: int = 30

    @field_validator("allowed_origins")
    @classmethod
    def parse_origins(cls, v: str) -> str:
        return v  # kept as raw string; list conversion happens in main.py

    def get_allowed_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.allowed_origins.split(",")]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
