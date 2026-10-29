"""Reviewer assignment, reasoned overrides, and decision-safety tests.

These cover the collaborative approval guarantees: assignments are version
bound, only the assignee (or an administrator) may decide, approvals with open
high-risk findings need a written override, repeated requests are idempotent,
stale versions cannot be approved, and dismissals leave an auditable reason.
"""
from __future__ import annotations

import uuid

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.db.session import SessionLocal
from app.main import app
from app.models.review import FindingOverride, ReviewAssignment
from app.models.workspace import UserProfile
from helpers import demo_login

CREATOR: dict[str, str] = {}
REVIEWER: dict[str, str] = {}
ADMIN: dict[str, str] = {}

CLEAN_TEXT = (
    "Acme Cloud offers a 99.9% monthly uptime SLA for INR 12,999 per month. "
    "Results vary by workload."
)
RISKY_TEXT = "AcmeCloud is the #1 fastest platform with 100% uptime."


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture(scope="module", autouse=True)
def demo_identities(client: TestClient):
    CREATOR.update(demo_login(client, "creator"))
    REVIEWER.update(demo_login(client, "reviewer"))
    ADMIN.update(demo_login(client, "admin"))


@pytest.fixture(scope="module")
def second_reviewer(client: TestClient) -> dict:
    with SessionLocal() as db:
        user = UserProfile(
            id=str(uuid.uuid4()),
            workspace_id=settings.DEFAULT_WORKSPACE_ID,
            email=f"second-reviewer-{uuid.uuid4().hex[:8]}@inkloom.demo",
            full_name="Second Demo Reviewer",
            title="Brand Reviewer",
            role="reviewer",
            is_demo=True,
        )
        db.add(user)
        db.commit()
        user_id = user.id
    response = client.post("/api/v1/auth/demo/session", json={"user_id": user_id})
    assert response.status_code == 201, response.text
    return {
        "user_id": user_id,
        "headers": {"Authorization": f"Bearer {response.json()['token']}"},
    }


def create_document(client: TestClient, text: str, title: str | None = None) -> dict:
    response = client.post(
        "/api/v1/audits/submit-and-audit",
        headers=CREATOR,
        json={
            "title": title or f"Workflow {uuid.uuid4().hex[:8]}",
            "content_type": "social_media",
            "content_text": text,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def submit(client: TestClient, document_id: str, notes: str = "Please review") -> dict:
    response = client.post(
        f"/api/v1/reviews/documents/{document_id}/submit",
        headers=CREATOR,
        json={"notes": notes},
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_assignment_is_version_bound_and_audited(
    client: TestClient, second_reviewer: dict
):
    document = create_document(client, CLEAN_TEXT)
    document_id = document["id"]
    version_id = document["current_version"]["id"]

    early = client.post(
        f"/api/v1/reviews/documents/{document_id}/assignment",
        headers=REVIEWER,
        json={},
    )
    assert early.status_code == 409, early.text

    submit(client, document_id)

    creator_attempt = client.post(
        f"/api/v1/reviews/documents/{document_id}/assignment",
        headers=CREATOR,
        json={},
    )
    assert creator_attempt.status_code == 403

    reviewer_attempt = client.post(
        f"/api/v1/reviews/documents/{document_id}/assignment",
        headers=REVIEWER,
        json={"assignee_id": "someone-else"},
    )
    assert reviewer_attempt.status_code == 403

    claimed = client.post(
        f"/api/v1/reviews/documents/{document_id}/assignment",
        headers=REVIEWER,
        json={"instructions": "Check pricing and the uptime claim first."},
    )
    assert claimed.status_code == 201, claimed.text
    assignment = claimed.json()
    assert assignment["status"] == "active"
    assert assignment["version_id"] == version_id
    assert assignment["assignee_name"]
    assert assignment["assigned_by_name"] == assignment["assignee_name"]

    repeated = client.post(
        f"/api/v1/reviews/documents/{document_id}/assignment",
        headers=REVIEWER,
        json={"instructions": "Check pricing and the uptime claim first."},
    )
    assert repeated.status_code == 201
    assert repeated.json()["id"] == assignment["id"]

    document_read = client.get(
        f"/api/v1/audits/documents/{document_id}", headers=CREATOR
    ).json()
    assert document_read["assignment"]["id"] == assignment["id"]

    fetched = client.get(
        f"/api/v1/reviews/documents/{document_id}/assignment", headers=CREATOR
    )
    assert fetched.status_code == 200
    assert fetched.json()["id"] == assignment["id"]

    queue = client.get("/api/v1/reviews/queue", headers=REVIEWER).json()
    queued = next(item for item in queue if item["id"] == document_id)
    assert queued["assignment"]["id"] == assignment["id"]

    admin_assignment = client.post(
        f"/api/v1/reviews/documents/{document_id}/assignment",
        headers=ADMIN,
        json={
            "assignee_id": second_reviewer["user_id"],
            "instructions": "Admin reassigned this review.",
        },
    )
    assert admin_assignment.status_code == 201, admin_assignment.text
    assert admin_assignment.json()["id"] != assignment["id"]
    assert admin_assignment.json()["assignee_name"] == "Second Demo Reviewer"

    with SessionLocal() as db:
        statuses = {
            row.status
            for row in db.query(ReviewAssignment)
            .filter(ReviewAssignment.document_id == document_id)
            .all()
        }
    assert statuses == {"superseded", "active"}

    approved = client.post(
        f"/api/v1/reviews/documents/{document_id}/decision",
        headers=ADMIN,
        json={
            "decision": "approved",
            "version_id": version_id,
            "feedback": "Administrator approval outside the active assignment.",
        },
    )
    assert approved.status_code == 200, approved.text
    metadata = approved.json()["decision_metadata"]
    assert metadata["decided_outside_assignment"] is True
    assert metadata["assignment_assignee"] == "Second Demo Reviewer"

    assert (
        client.get(
            f"/api/v1/reviews/documents/{document_id}/assignment", headers=ADMIN
        ).json()
        is None
    )

    history = client.get(
        f"/api/v1/history/documents/{document_id}/events", headers=CREATOR
    ).json()
    decision_event = next(
        event for event in history if event["event_type"] == "decision_approved"
    )
    assert "outside the assignment to Second Demo Reviewer" in decision_event["description"]
    assert any(event["event_type"] == "reviewer_assigned" for event in history)

    with SessionLocal() as db:
        statuses = {
            row.status
            for row in db.query(ReviewAssignment)
            .filter(ReviewAssignment.document_id == document_id)
            .all()
        }
    assert statuses == {"superseded", "completed"}


def test_assigned_reviewer_blocks_other_reviewers(
    client: TestClient, second_reviewer: dict
):
    document = create_document(client, CLEAN_TEXT)
    document_id = document["id"]
    version_id = document["current_version"]["id"]
    submit(client, document_id)

    claimed = client.post(
        f"/api/v1/reviews/documents/{document_id}/assignment",
        headers=REVIEWER,
        json={"instructions": "Primary reviewer owns this decision."},
    )
    assert claimed.status_code == 201, claimed.text

    blocked = client.post(
        f"/api/v1/reviews/documents/{document_id}/decision",
        headers=second_reviewer["headers"],
        json={
            "decision": "approved",
            "version_id": version_id,
            "feedback": "Attempting to decide someone else's assignment.",
        },
    )
    assert blocked.status_code == 403, blocked.text
    assert "assigned to" in blocked.json()["detail"]

    still_pending = client.get(
        f"/api/v1/audits/documents/{document_id}", headers=CREATOR
    ).json()
    assert still_pending["status"] == "in_review"
    assert still_pending["assignment"]["status"] == "active"


def test_approval_with_open_high_findings_requires_written_override(client: TestClient):
    document = create_document(client, RISKY_TEXT)
    document_id = document["id"]
    version_id = document["current_version"]["id"]
    submit(client, document_id)

    without_reason = client.post(
        f"/api/v1/reviews/documents/{document_id}/decision",
        headers=REVIEWER,
        json={"decision": "approved", "version_id": version_id},
    )
    assert without_reason.status_code == 422, without_reason.text
    assert "override" in without_reason.json()["detail"].lower()

    too_short = client.post(
        f"/api/v1/reviews/documents/{document_id}/decision",
        headers=REVIEWER,
        json={
            "decision": "approved",
            "version_id": version_id,
            "override_reason": "legal ok",
        },
    )
    assert too_short.status_code == 422
    assert "10 characters" in too_short.json()["detail"]

    approved = client.post(
        f"/api/v1/reviews/documents/{document_id}/decision",
        headers=REVIEWER,
        json={
            "decision": "approved",
            "version_id": version_id,
            "feedback": "Approved with a documented exception.",
            "override_reason": "Legal signed off on the launch claim on 2026-10-20.",
        },
    )
    assert approved.status_code == 200, approved.text
    decision = approved.json()
    metadata = decision["decision_metadata"]
    assert metadata["open_priority_findings_at_decision"] >= 1
    assert metadata["override_reason"].startswith("Legal signed off")

    repeated = client.post(
        f"/api/v1/reviews/documents/{document_id}/decision",
        headers=REVIEWER,
        json={
            "decision": "approved",
            "version_id": version_id,
            "feedback": "Approved with a documented exception.",
            "override_reason": "Legal signed off on the launch claim on 2026-10-20.",
        },
    )
    assert repeated.status_code == 200
    assert repeated.json()["id"] == decision["id"]

    decisions = client.get(
        f"/api/v1/reviews/documents/{document_id}/decisions", headers=CREATOR
    ).json()
    assert len(decisions) == 1, "A retried approval must not duplicate the record"

    different = client.post(
        f"/api/v1/reviews/documents/{document_id}/decision",
        headers=REVIEWER,
        json={
            "decision": "rejected",
            "version_id": version_id,
            "feedback": "A late, different decision should be refused.",
        },
    )
    assert different.status_code == 409

    history = client.get(
        f"/api/v1/history/documents/{document_id}/events", headers=CREATOR
    ).json()
    event = next(item for item in history if item["event_type"] == "decision_approved")
    assert "Override reason" in event["description"]
    assert event["metadata"]["override_reason"].startswith("Legal signed off")


def test_unsubmitted_and_superseded_versions_cannot_be_decided(client: TestClient):
    document = create_document(client, CLEAN_TEXT)
    document_id = document["id"]
    version_one = document["current_version"]["id"]

    premature = client.post(
        f"/api/v1/reviews/documents/{document_id}/decision",
        headers=REVIEWER,
        json={"decision": "approved", "version_id": version_one},
    )
    assert premature.status_code == 409
    assert "not awaiting review" in premature.json()["detail"]

    submit(client, document_id)
    revised = client.post(
        f"/api/v1/audits/documents/{document_id}/versions",
        headers=CREATOR,
        json={"content_text": CLEAN_TEXT + " Updated.", "change_summary": "Revision"},
    )
    assert revised.status_code == 201, revised.text
    version_two = revised.json()["current_version"]["id"]

    stale = client.post(
        f"/api/v1/reviews/documents/{document_id}/decision",
        headers=REVIEWER,
        json={"decision": "approved", "version_id": version_one},
    )
    assert stale.status_code == 409
    assert "superseded" in stale.json()["detail"]

    not_submitted = client.post(
        f"/api/v1/reviews/documents/{document_id}/decision",
        headers=REVIEWER,
        json={"decision": "approved", "version_id": version_two},
    )
    assert not_submitted.status_code == 409

    submit(client, document_id, notes="Version 2 is ready")
    approved = client.post(
        f"/api/v1/reviews/documents/{document_id}/decision",
        headers=REVIEWER,
        json={"decision": "approved", "version_id": version_two},
    )
    assert approved.status_code == 200, approved.text


def test_dismissals_keep_a_reasoned_override_record(client: TestClient):
    document = create_document(client, RISKY_TEXT)
    document_id = document["id"]
    findings = document["latest_audit"]["findings"]
    assert findings
    finding = findings[0]

    creator_attempt = client.patch(
        f"/api/v1/audits/findings/{finding['id']}",
        headers=CREATOR,
        json={"action": "dismiss", "dismissal_reason": "The creator cannot dismiss this."},
    )
    assert creator_attempt.status_code == 403

    too_short = client.patch(
        f"/api/v1/audits/findings/{finding['id']}",
        headers=REVIEWER,
        json={"action": "dismiss", "dismissal_reason": "bad"},
    )
    assert too_short.status_code == 422

    reason = "Approved exception logged in the launch review meeting."
    dismissed = client.patch(
        f"/api/v1/audits/findings/{finding['id']}",
        headers=REVIEWER,
        json={"action": "dismiss", "dismissal_reason": reason},
    )
    assert dismissed.status_code == 200, dismissed.text
    assert dismissed.json()["status"] == "dismissed"
    assert dismissed.json()["dismissal_reason"] == reason

    repeated = client.patch(
        f"/api/v1/audits/findings/{finding['id']}",
        headers=REVIEWER,
        json={"action": "dismiss", "dismissal_reason": reason},
    )
    assert repeated.status_code == 200

    with SessionLocal() as db:
        rows = (
            db.query(FindingOverride)
            .filter(FindingOverride.finding_id == finding["id"])
            .all()
        )
    assert len(rows) == 1, "A retried dismissal must not duplicate the override record"
    assert rows[0].workspace_id == settings.DEFAULT_WORKSPACE_ID
    assert rows[0].rule_name
    assert rows[0].severity == finding["severity"]
    assert rows[0].reason == reason
    assert rows[0].reviewer_role == "reviewer"

    history = client.get(
        f"/api/v1/history/documents/{document_id}/events", headers=CREATOR
    ).json()
    event = next(item for item in history if item["event_type"] == "finding_action")
    assert event["metadata"]["override_reason"] == reason
