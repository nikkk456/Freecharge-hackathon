"""All domain enums in one place. String-valued so they're readable in the DB
and stable across migrations."""
from __future__ import annotations

import enum


class Role(str, enum.Enum):
    ANALYST = "analyst"
    REVIEWER = "reviewer"
    OWNER = "owner"
    ADMIN = "admin"


class CircularSource(str, enum.Enum):
    RBI = "RBI"
    SEBI = "SEBI"
    PMC = "PMC"
    CMC = "CMC"
    INTERNAL = "INTERNAL"
    OTHER = "OTHER"


class CircularStatus(str, enum.Enum):
    UPLOADED = "UPLOADED"
    PARSING = "PARSING"
    PARSED = "PARSED"
    ANALYZING = "ANALYZING"
    ANALYZED = "ANALYZED"
    PUBLISHED = "PUBLISHED"
    FAILED = "FAILED"


class AnalysisStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    PUBLISHED = "PUBLISHED"
    SUPERSEDED = "SUPERSEDED"


class RiskRating(str, enum.Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"
    CRITICAL = "CRITICAL"


class ActionItemStatus(str, enum.Enum):
    OPEN = "OPEN"
    IN_PROGRESS = "IN_PROGRESS"
    BLOCKED = "BLOCKED"
    SUBMITTED = "SUBMITTED"
    CLOSED = "CLOSED"
    OVERDUE = "OVERDUE"


class Priority(str, enum.Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


class RcmStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    PUBLISHED = "PUBLISHED"


class KciFrequency(str, enum.Enum):
    DAILY = "DAILY"
    WEEKLY = "WEEKLY"
    MONTHLY = "MONTHLY"
    QUARTERLY = "QUARTERLY"


class SourceSystem(str, enum.Enum):
    CAMS = "CAMS"
    GCM = "GCM"
    MANUAL = "MANUAL"


class SubmissionStatus(str, enum.Enum):
    RECEIVED = "RECEIVED"
    REVIEWED = "REVIEWED"
    ACCEPTED = "ACCEPTED"
    REJECTED = "REJECTED"


class AssertionSource(str, enum.Enum):
    """Who asserted a fact — the crux of the audit story."""
    AI = "AI"
    HUMAN = "HUMAN"


class ActorKind(str, enum.Enum):
    HUMAN = "HUMAN"
    AI = "AI"
    SYSTEM = "SYSTEM"
