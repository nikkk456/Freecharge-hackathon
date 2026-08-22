from __future__ import annotations

import uuid
from datetime import date

from pgvector.sqlalchemy import Vector
from sqlalchemy import Date, Enum, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.config import settings
from app.db.base import Base, TimestampMixin, UUIDPkMixin
from app.models.enums import AssertionSource, CircularSource, CircularStatus


class Circular(UUIDPkMixin, TimestampMixin, Base):
    __tablename__ = "circulars"

    source: Mapped[CircularSource] = mapped_column(
        Enum(CircularSource, name="circular_source"), default=CircularSource.RBI
    )
    ref_no: Mapped[str | None] = mapped_column(String(255), index=True)
    title: Mapped[str | None] = mapped_column(String(1024))
    issued_date: Mapped[date | None] = mapped_column(Date)
    raw_text: Mapped[str | None] = mapped_column(Text)
    pdf_object_key: Mapped[str | None] = mapped_column(String(1024))
    page_count: Mapped[int | None] = mapped_column(Integer)
    # [{page, char_start, char_end}] over `raw_text`. Lets a citation offset be
    # resolved back to a page number — "this claim came from page 9" — without
    # re-parsing the PDF.
    page_map: Mapped[list | None] = mapped_column(JSONB)
    # Why parsing failed, shown to the human instead of a silent FAILED status.
    parse_error: Mapped[str | None] = mapped_column(Text)
    # Why the last analysis run failed. Separate from parse_error: a circular whose
    # text is fine but whose AI run failed must stay usable for manual review.
    analysis_error: Mapped[str | None] = mapped_column(Text)
    status: Mapped[CircularStatus] = mapped_column(
        Enum(CircularStatus, name="circular_status"),
        default=CircularStatus.UPLOADED,
        index=True,
    )
    uploaded_by: Mapped[uuid.UUID | None] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("users.id")
    )

    chunks: Mapped[list[CircularChunk]] = relationship(
        back_populates="circular", cascade="all, delete-orphan"
    )
    impacted_functions: Mapped[list[CircularFunction]] = relationship(
        back_populates="circular", cascade="all, delete-orphan"
    )


class CircularChunk(UUIDPkMixin, TimestampMixin, Base):
    """A slice of the circular's raw text plus its embedding. `char_start/end`
    index into `Circular.raw_text` and are what make citations *verifiable*."""

    __tablename__ = "circular_chunks"

    circular_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("circulars.id", ondelete="CASCADE"), index=True
    )
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    char_start: Mapped[int] = mapped_column(Integer, nullable=False)
    char_end: Mapped[int] = mapped_column(Integer, nullable=False)
    embedding: Mapped[list[float] | None] = mapped_column(
        Vector(settings.active_embedding_dim)
    )

    circular: Mapped[Circular] = relationship(back_populates="chunks")


class Function(UUIDPkMixin, TimestampMixin, Base):
    """Master list of internal departments/functions that circulars can impact."""

    __tablename__ = "functions"

    # Business code from the seed library, e.g. "F03". Stable across reseeds, so
    # prompts and fixtures can refer to a function without knowing its UUID.
    code: Mapped[str] = mapped_column(String(16), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)


class CircularFunction(UUIDPkMixin, TimestampMixin, Base):
    """M:N join with the AI's confidence + reasoning for *why* the function is impacted."""

    __tablename__ = "circular_functions"

    circular_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("circulars.id", ondelete="CASCADE"), index=True
    )
    function_id: Mapped[uuid.UUID] = mapped_column(
        PgUUID(as_uuid=True), ForeignKey("functions.id"), index=True
    )
    confidence: Mapped[float | None] = mapped_column(Float)
    reasoning: Mapped[str | None] = mapped_column(Text)
    source: Mapped[AssertionSource] = mapped_column(
        Enum(AssertionSource, name="assertion_source_cf"), default=AssertionSource.AI
    )

    circular: Mapped[Circular] = relationship(back_populates="impacted_functions")
    function: Mapped[Function] = relationship()
