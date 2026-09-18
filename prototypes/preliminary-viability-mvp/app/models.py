import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import JSON, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def utc_now() -> datetime:
    return datetime.now(UTC)


class Assessment(Base):
    __tablename__ = "assessments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    site_id: Mapped[str] = mapped_column(String(100), index=True)
    create_idempotency_key: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    submitted_by: Mapped[str] = mapped_column(String(150))
    site_snapshot: Mapped[dict[str, Any]] = mapped_column(JSON)
    provider_snapshot: Mapped[dict[str, Any]] = mapped_column(JSON)
    assessment_snapshot: Mapped[dict[str, Any]] = mapped_column(JSON)
    financial_snapshot: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    original_recommendation: Mapped[str] = mapped_column(String(40))
    final_human_decision: Mapped[str | None] = mapped_column(String(40), nullable=True)
    review_status: Mapped[str] = mapped_column(String(40), default="awaiting_review")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utc_now, onupdate=utc_now
    )
    reviews: Mapped[list["Review"]] = relationship(back_populates="assessment")


class Review(Base):
    __tablename__ = "reviews"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    assessment_id: Mapped[str] = mapped_column(ForeignKey("assessments.id"), index=True)
    idempotency_key: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    reviewer_identity: Mapped[str] = mapped_column(String(150))
    original_recommendation: Mapped[str] = mapped_column(String(40))
    decision: Mapped[str] = mapped_column(String(40))
    rationale: Mapped[str] = mapped_column(Text)
    reviewer_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    feedback_category: Mapped[str | None] = mapped_column(String(100), nullable=True)
    policy_version: Mapped[str] = mapped_column(String(80))
    input_snapshot: Mapped[dict[str, Any]] = mapped_column(JSON)
    provider_snapshot: Mapped[dict[str, Any]] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    assessment: Mapped[Assessment] = relationship(back_populates="reviews")


class Feedback(Base):
    __tablename__ = "feedback"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    assessment_id: Mapped[str] = mapped_column(ForeignKey("assessments.id"), index=True)
    idempotency_key: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    reviewer_identity: Mapped[str] = mapped_column(String(150))
    payload: Mapped[dict[str, Any]] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class ImageRecord(Base):
    __tablename__ = "image_records"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    assessment_id: Mapped[str] = mapped_column(ForeignKey("assessments.id"), index=True)
    stored_filename: Mapped[str] = mapped_column(String(255))
    original_filename: Mapped[str] = mapped_column(String(255))
    media_type: Mapped[str] = mapped_column(String(80))
    sha256: Mapped[str] = mapped_column(String(64))
    provider_status: Mapped[str] = mapped_column(String(40))
    observations: Mapped[list[dict[str, Any]]] = mapped_column(JSON)
    corrections: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    assessment_id: Mapped[str] = mapped_column(ForeignKey("assessments.id"), index=True)
    event_type: Mapped[str] = mapped_column(String(80), index=True)
    actor: Mapped[str] = mapped_column(String(150))
    payload: Mapped[dict[str, Any]] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)