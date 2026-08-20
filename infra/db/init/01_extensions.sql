-- Enabled once, at database creation time, by the Postgres docker entrypoint.
-- Alembic migrations assume these extensions already exist.
CREATE EXTENSION IF NOT EXISTS vector;      -- pgvector: semantic search / RAG
CREATE EXTENSION IF NOT EXISTS pgcrypto;    -- gen_random_uuid()
