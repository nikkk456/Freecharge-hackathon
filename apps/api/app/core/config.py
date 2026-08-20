"""Centralised, typed application settings loaded from the environment / .env.

Everything configurable lives here so there is exactly one source of truth. The
LLM/embedding settings are intentionally provider-agnostic — see `.env.example`.
"""
from __future__ import annotations

from functools import lru_cache

from pydantic import Field, computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../../.env"),  # api-local or repo-root .env
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # ---- App ----
    app_env: str = "development"
    app_name: str = "compliance-advisory-copilot"
    log_level: str = "INFO"
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    cors_origins: str = "http://localhost:3000"

    # ---- Auth ----
    jwt_secret: str = "change-me-in-production"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 480

    # ---- Postgres ----
    postgres_user: str = "cac"
    postgres_password: str = "cac_password"
    postgres_db: str = "cac"
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    database_url: str | None = None  # explicit override wins

    # ---- Redis ----
    redis_host: str = "localhost"
    redis_port: int = 6379
    redis_db: int = 0

    # ---- Object storage (S3/MinIO) ----
    s3_endpoint_url: str = "http://localhost:9000"
    s3_access_key: str = "minioadmin"
    s3_secret_key: str = "minioadmin"
    s3_bucket: str = "circulars"
    s3_region: str = "us-east-1"

    # ---- LLM (provider-agnostic via LiteLLM) ----
    llm_provider: str = "openai"
    llm_model: str = "openai/gpt-4o-mini"
    llm_temperature: float = 0.0
    llm_max_tokens: int = 4096

    openai_api_key: str | None = None
    anthropic_api_key: str | None = None
    azure_api_key: str | None = None
    azure_api_base: str | None = None
    azure_api_version: str | None = None

    # ---- Embeddings ----
    embedding_model: str = "openai/text-embedding-3-small"
    embedding_dim: int = 1536
    use_local_embeddings: bool = False
    local_embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"
    local_embedding_dim: int = 384

    # ---- OCR ----
    ocr_enabled: bool = False
    tesseract_cmd: str | None = None

    # ---- AI thresholds (design-for-failure) ----
    # Analyses below this confidence are flagged and cannot be auto-accepted.
    min_confidence_for_autoaccept: float = Field(default=0.75, ge=0, le=1)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def sqlalchemy_dsn(self) -> str:
        if self.database_url:
            return self.database_url
        return (
            f"postgresql+asyncpg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @computed_field  # type: ignore[prop-decorator]
    @property
    def redis_dsn(self) -> str:
        return f"redis://{self.redis_host}:{self.redis_port}/{self.redis_db}"

    @computed_field  # type: ignore[prop-decorator]
    @property
    def active_embedding_dim(self) -> int:
        return self.local_embedding_dim if self.use_local_embeddings else self.embedding_dim

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
