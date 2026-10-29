"""Reviewer assignment helpers.

Assignments are version-bound: assigning a reviewer targets the latest version
at the time of assignment, and creating a new version supersedes the active
assignment instead of deleting it.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy.orm import Session

from app.models.review import ReviewAssignment


def active_assignment(
    db: Session, document_id: str, version_id: Optional[str] = None
) -> Optional[ReviewAssignment]:
    query = db.query(ReviewAssignment).filter(
        ReviewAssignment.document_id == document_id,
        ReviewAssignment.status == "active",
    )
    if version_id:
        query = query.filter(ReviewAssignment.version_id == version_id)
    return query.order_by(ReviewAssignment.created_at.desc()).first()


def supersede_active_assignments(db: Session, document_id: str) -> int:
    rows = (
        db.query(ReviewAssignment)
        .filter(
            ReviewAssignment.document_id == document_id,
            ReviewAssignment.status == "active",
        )
        .all()
    )
    now = datetime.now(timezone.utc)
    for row in rows:
        row.status = "superseded"
        row.updated_at = now
    return len(rows)


def complete_assignment(db: Session, assignment: Optional[ReviewAssignment]) -> None:
    if not assignment or assignment.status != "active":
        return
    assignment.status = "completed"
    assignment.updated_at = datetime.now(timezone.utc)


def serialize_assignment(assignment: ReviewAssignment) -> dict:
    return {
        "id": assignment.id,
        "document_id": assignment.document_id,
        "version_id": assignment.version_id,
        "assignee_id": assignment.assignee_id,
        "assignee_name": assignment.assignee_name,
        "assignee_role": assignment.assignee_role,
        "assigned_by_name": assignment.assigned_by_name,
        "status": assignment.status,
        "instructions": assignment.instructions,
        "created_at": assignment.created_at,
        "updated_at": assignment.updated_at,
    }
