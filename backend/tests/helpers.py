"""Shared test helpers for server-issued sessions."""
from __future__ import annotations

from fastapi.testclient import TestClient

from app.core.config import settings


def demo_login(
    client: TestClient,
    role: str = "creator",
    workspace_id: str | None = None,
) -> dict:
    body: dict = {"role": role, "workspace_id": workspace_id or settings.DEFAULT_WORKSPACE_ID}
    response = client.post("/api/v1/auth/demo/session", json=body)
    assert response.status_code == 201, response.text
    return {"Authorization": f"Bearer {response.json()['token']}"}
