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
    """Where a piece of work has got to.

    There is deliberately no OVERDUE member. Overdue is a property of the *due date*,
    not a stage of the work: an item can be IN_PROGRESS and late at the same time, and
    storing OVERDUE as the status would destroy the only record of what was actually
    happening to it. It is derived — see `tracker.service.is_overdue`.
    """

    OPEN = "OPEN"
    IN_PROGRESS = "IN_PROGRESS"
    BLOCKED = "BLOCKED"
    SUBMITTED = "SUBMITTED"
    CLOSED = "CLOSED"


class Priority(str, enum.Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


class RcmStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    PUBLISHED = "PUBLISHED"


class Coverage(str, enum.Enum):
    """How well the existing control library answers a risk.

    GAP is the finding that matters most: it is the one that creates work. A row
    claiming COVERED with no control behind it is a contradiction, and the service
    downgrades it rather than storing it.
    """

    COVERED = "COVERED"
    PARTIAL = "PARTIAL"
    GAP = "GAP"


class KciFrequency(str, enum.Enum):
    DAILY = "DAILY"
    WEEKLY = "WEEKLY"
    MONTHLY = "MONTHLY"
    QUARTERLY = "QUARTERLY"


class KciStatus(str, enum.Enum):
    """RAG health of a KCI against its target — how the control library reads today."""
    GREEN = "green"
    AMBER = "amber"
    RED = "red"


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
