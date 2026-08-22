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
    llm_provider: str = "gemini"
    llm_model: str = "gemini/gemini-3.7-flash"
    # Tried in order when the primary is rate-limited or returns 503. Free-tier Gemini
    # genuinely does return "high demand" spikes, so this is not defensive padding.
    llm_fallback_models: str = "gemini/gemini-3.6-flash,gemini/gemini-3.5-flash"
    # 1.0, not 0.0. Lowering temperature is the usual move for structured extraction,
    # but Google explicitly warns that temperature < 1.0 on Gemini 3 models causes
    # "infinite loops, degraded reasoning performance, and failure on complex tasks" —
    # and analysing an 11-page circular is exactly a complex task. Determinism is not
    # worth degraded reasoning here; a human reviews every draft anyway.
    llm_temperature: float = 1.0
    llm_max_tokens: int = 8192
    llm_timeout_seconds: int = 120
    llm_max_attempts: int = 3  # per model, with exponential backoff

    gemini_api_key: str | None = None
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

    # ---- PDF ingestion ----
    max_upload_mb: int = 25
    # A text-layer PDF this short is almost certainly a scan; we reject it with a
    # clear message rather than handing an empty document to the model.
    min_extracted_chars: int = 200

    # ---- OCR (scanned PDFs) ----
    # Runs entirely on this machine: a regulatory document never leaves the
    # environment to be read. Same argument as control C-022 (data localisation).
    ocr_enabled: bool = True
    # "auto" prefers tesseract (better on the italic serif RBI uses) and falls back
    # to rapidocr, which needs no system binary. Force one with "tesseract"/"rapidocr".
    ocr_engine: str = "auto"
    ocr_dpi: int = 200
    # A page whose text layer is shorter than this is treated as an image and sent
    # to OCR. Set well below a real page of prose (~1500 chars) but above a stray
    # header that a scanner sometimes leaves behind.
    ocr_min_page_chars: int = 80
    # Hard stop so one enormous scan cannot occupy the worker indefinitely.
    ocr_max_pages: int = 60
    # Tesseract only. Add Hindi with "eng+hin" once hin.traineddata is installed.
    ocr_languages: str = "eng"
    tesseract_cmd: str | None = None  # explicit path if tesseract.exe is not on PATH

    # ---- AI thresholds (design-for-failure) ----
    # Analyses below this confidence are flagged and cannot be auto-accepted.
    min_confidence_for_autoaccept: float = Field(default=0.75, ge=0, le=1)
    # A quote shorter than this is not searched for at all: a fragment like "the bank"
    # occurs everywhere, so locating it would prove nothing about which occurrence
    # supports the claim. Such citations are reported unverified, not silently passed.
    min_citation_quote_chars: int = 16

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

    @property
    def llm_model_chain(self) -> list[str]:
        """Primary model first, then each fallback. Duplicates removed, order kept."""
        chain = [self.llm_model, *self.llm_fallback_models.split(",")]
        seen: dict[str, None] = {}
        for model in (m.strip() for m in chain):
            if model:
                seen.setdefault(model, None)
        return list(seen)


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
