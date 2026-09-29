from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://ruleguarder:ruleguarder@localhost:5432/ruleguarder"
    upload_dir: Path = Path("/data/uploads")
    max_upload_mb: int = 20
    # Comma-separated list, e.g. "http://localhost:5173,http://localhost:8080"
    cors_origins: str = "http://localhost:5173,http://localhost:8080"
    log_level: str = "info"

    # LLM
    llm_provider: str = "gemini"
    gemini_api_key: str | None = None
    llm_model: str = "gemini-3.5-flash"
    # Comma-separated models tried in order when LLM_MODEL is overloaded (503/504/timeout).
    # Empty by default: every fallback attempt is another request against your quota.
    llm_fallback_models: str = ""
    llm_max_tokens: int = 32000
    # None => the model's default temperature
    llm_temperature: float | None = None
    # Retries per model on rate limit (429). Each retry is an extra request.
    llm_max_retries: int = 1
    llm_timeout_seconds: float = 120
    # Documents longer than this are split into several LLM calls
    llm_chunk_chars: int = 60000
    # Keep low on the free tier: parallel calls count against the per-minute quota
    llm_max_parallel: int = 1

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def llm_models(self) -> list[str]:
        fallbacks = [m.strip() for m in self.llm_fallback_models.split(",") if m.strip()]
        return [self.llm_model, *(m for m in fallbacks if m != self.llm_model)]

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024


@lru_cache
def get_settings() -> Settings:
    return Settings()
