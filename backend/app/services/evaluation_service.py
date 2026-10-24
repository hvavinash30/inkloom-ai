"""Evaluation harness for the deterministic audit engine.

Cases are small, synthetic fixtures with explicit expectations. A run means the
engine actually executed against the workspace's current rules and facts; the
recorded result is the measured output, including failures. This is not an
external benchmark and must not be presented as one.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.approved_fact import ApprovedFact
from app.models.assets import EvaluationCase, EvaluationRun
from app.models.brand_rule import BrandRule
from app.services.audit_engine import (
    run_page_audit,
    run_text_audit,
    run_transcript_audit,
)


def serialize_case(case: EvaluationCase, last_run: EvaluationRun | None = None) -> dict:
    def load(raw):
        try:
            return json.loads(raw) if raw else {}
        except (TypeError, ValueError):
            return {}

    return {
        "id": case.id,
        "name": case.name,
        "description": case.description,
        "case_type": case.case_type,
        "input_payload": load(case.input_payload),
        "expected_outcome": load(case.expected_outcome),
        "expected_summary": case.expected_summary,
        "version": case.version,
        "is_demo": case.is_demo,
        "last_run": serialize_run(last_run, case.name) if last_run else None,
    }


def serialize_run(run: EvaluationRun, case_name: str | None = None) -> dict:
    try:
        details = json.loads(run.details) if run.details else {}
    except (TypeError, ValueError):
        details = {}
    try:
        categories = json.loads(run.matched_categories) if run.matched_categories else []
    except (TypeError, ValueError):
        categories = []
    return {
        "id": run.id,
        "case_id": run.case_id,
        "case_name": case_name,
        "status": run.status,
        "findings_count": run.findings_count,
        "matched_categories": categories,
        "actual_location": run.actual_location,
        "details": details,
        "executed_at": run.executed_at,
    }


def _latest_run(db: Session, case_id: str) -> EvaluationRun | None:
    return (
        db.query(EvaluationRun)
        .filter(EvaluationRun.case_id == case_id)
        .order_by(EvaluationRun.executed_at.desc())
        .first()
    )


def _rules_and_facts(db: Session, workspace_id: str):
    rules = (
        db.query(BrandRule)
        .filter(BrandRule.workspace_id == workspace_id)
        .all()
    )
    facts = (
        db.query(ApprovedFact)
        .filter(ApprovedFact.workspace_id == workspace_id)
        .all()
    )
    return rules, facts


def run_case(db: Session, case: EvaluationCase) -> EvaluationRun:
    try:
        payload = json.loads(case.input_payload) if case.input_payload else {}
    except (TypeError, ValueError):
        payload = {}
    try:
        expected = json.loads(case.expected_outcome) if case.expected_outcome else {}
    except (TypeError, ValueError):
        expected = {}

    rules, facts = _rules_and_facts(db, case.workspace_id)
    try:
        if case.case_type == "pdf":
            pages = payload.get("page_texts") or []
            result = run_page_audit(pages, rules, facts)
        elif case.case_type == "video":
            segments = payload.get("transcript_segments") or []
            text = payload.get("content_text", "")
            result = run_transcript_audit(segments, text, rules, facts)
        else:
            result = run_text_audit(payload.get("content_text", ""), rules, facts)
    except Exception as exc:  # pragma: no cover - defensive boundary
        run = EvaluationRun(
            case_id=case.id,
            status="error",
            findings_count=0,
            matched_categories=json.dumps([]),
            details=json.dumps(
                {
                    "error": f"{type(exc).__name__}: {exc}",
                    "note": "The harness recorded the error; it did not mark the case as passed.",
                }
            ),
            executed_at=datetime.now(timezone.utc),
        )
        db.add(run)
        db.commit()
        db.refresh(run)
        return run

    findings = result.findings
    categories = sorted({finding["category"] for finding in findings})
    text_blob = " ".join(
        " ".join(
            str(finding.get(key) or "")
            for key in ("affected_text", "title", "explanation")
        )
        for finding in findings
    ).lower()

    checks = []
    expected_categories = expected.get("must_include_categories") or []
    for category in expected_categories:
        passed = any(finding["category"] == category for finding in findings)
        checks.append(
            {
                "check": f"category:{category}",
                "expected": category,
                "passed": passed,
                "actual_categories": categories,
            }
        )
    expected_texts = expected.get("must_include_text") or []
    for text in expected_texts:
        passed = text.lower() in text_blob
        checks.append(
            {
                "check": f"text:{text}",
                "expected": text,
                "passed": passed,
            }
        )
    expected_page = expected.get("expected_page")
    if expected_page is not None:
        pages = sorted(
            {finding.get("page_number") for finding in findings if finding.get("page_number")}
        )
        checks.append(
            {
                "check": "page_location",
                "expected": expected_page,
                "passed": expected_page in pages,
                "actual_pages": pages,
            }
        )
    expected_timestamp = expected.get("expected_timestamp_seconds")
    if expected_timestamp is not None:
        timestamps = sorted(
            {
                round(float(finding["timestamp_seconds"]))
                for finding in findings
                if finding.get("timestamp_seconds") is not None
            }
        )
        checks.append(
            {
                "check": "timestamp_location",
                "expected": expected_timestamp,
                "passed": int(expected_timestamp) in timestamps,
                "actual_timestamps": timestamps,
            }
        )
    if expected.get("expect_clean"):
        checks.append(
            {
                "check": "clean_copy",
                "expected": "no findings",
                "passed": not findings,
                "actual_count": len(findings),
            }
        )
    passed = all(check["passed"] for check in checks)
    details = {
        "score": result.score,
        "risk_level": result.risk_level,
        "verification_status": result.verification_status,
        "model_used": result.model_used,
        "checks": checks,
        "actual_findings": [
            {
                "title": finding["title"],
                "category": finding["category"],
                "severity": finding["severity"],
                "affected_text": finding["affected_text"],
                "page_number": finding.get("page_number"),
                "timestamp_seconds": finding.get("timestamp_seconds"),
                "location_label": finding.get("location_label"),
            }
            for finding in findings
        ],
        "note": (
            "Result measured by executing the deterministic engine against current workspace "
            "records. Synthetic fixture, not an external benchmark."
        ),
    }
    actual_location = None
    if findings:
        first = findings[0]
        actual_location = first.get("location_label") or (
            f"Page {first['page_number']}" if first.get("page_number") else "Document"
        )
    run = EvaluationRun(
        case_id=case.id,
        status="passed" if passed else "failed",
        findings_count=len(findings),
        matched_categories=json.dumps(categories),
        actual_location=actual_location,
        details=json.dumps(details),
        executed_at=datetime.now(timezone.utc),
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    return run


def run_all_cases(db: Session, workspace_id: str) -> list[EvaluationRun]:
    cases = (
        db.query(EvaluationCase)
        .filter(EvaluationCase.workspace_id == workspace_id)
        .order_by(EvaluationCase.name)
        .all()
    )
    return [run_case(db, case) for case in cases]


def build_summary(db: Session, workspace_id: str) -> dict:
    cases = (
        db.query(EvaluationCase)
        .filter(EvaluationCase.workspace_id == workspace_id)
        .order_by(EvaluationCase.name)
        .all()
    )
    latest_runs = []
    passed = failed = errors = 0
    for case in cases:
        run = _latest_run(db, case.id)
        if run:
            latest_runs.append(serialize_run(run, case.name))
            if run.status == "passed":
                passed += 1
            elif run.status == "error":
                errors += 1
            else:
                failed += 1
    executed = len(latest_runs)
    pass_rate = round((passed / executed) * 100, 1) if executed else 0.0
    return {
        "executed_cases": executed,
        "passed": passed,
        "failed": failed,
        "errors": errors,
        "pass_rate_percent": pass_rate,
        "note": (
            "Pass rate is measured on the internal synthetic fixture set against the current "
            "workspace rules and facts. It is not an external benchmark, a customer result, or a "
            "general claim of accuracy."
        ),
        "runs": latest_runs,
        "cases": [serialize_case(case, _latest_run(db, case.id)) for case in cases],
    }
