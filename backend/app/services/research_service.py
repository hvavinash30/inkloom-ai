"""Research provenance records.

Seeded research is explicitly demo material. Entries marked planned have not
been executed; the UI renders their status so the project never implies that a
survey, interview, or validation session happened when it did not.
"""
from __future__ import annotations

import json

from app.models.assets import ResearchRecord


SECTION_LABELS = {
    "literature": "Literature review",
    "survey": "Survey",
    "interviews": "Interviews",
    "competitor": "Competitor research",
    "validation": "Validation",
    "traceability": "Requirement traceability",
}


def serialize_record(record: ResearchRecord) -> dict:
    def load(raw):
        try:
            return json.loads(raw) if raw else {}
        except (TypeError, ValueError):
            return {}

    try:
        sources = json.loads(record.sources) if record.sources else []
    except (TypeError, ValueError):
        sources = []
    return {
        "id": record.id,
        "section": record.section,
        "title": record.title,
        "status": record.status,
        "summary": record.summary,
        "details": load(record.details),
        "sources": sources,
        "owner_name": record.owner_name,
        "is_demo": record.is_demo,
        "created_at": record.created_at,
        "updated_at": record.updated_at,
    }
