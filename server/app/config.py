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
    llm_provider: str = "anthropic"
    anthropic_api_key: str | None = None
    llm_model: str = "claude-opus-5-5"
    llm_effort: str = "high"  # low | medium | high | xhigh | max
    llm_max_tokens: int = 32000
    # Documents longer than this are split into several LLM calls
    llm_chunk_chars: int = 60000
    llm_max_parallel: int = 4

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024


@lru_cache
def get_settings() -> Settings:
    return Settings()
