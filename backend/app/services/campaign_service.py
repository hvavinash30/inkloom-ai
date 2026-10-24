"""Campaign consistency, readiness, and graph data.

Conflicts are derived only from claims that are actually present in the saved
versions of the campaign's assets. The detector does not assume facts about the
brand; it compares the claims against each other and, where possible, cites an
approved fact as the reference value.
"""
from __future__ import annotations

import re
from collections import defaultdict
from datetime import datetime, timezone
from typing import Iterable, Optional

from sqlalchemy.orm import Session

from app.models.approved_fact import ApprovedFact
from app.models.audit import AuditFinding
from app.models.campaign import Campaign, CampaignConflict
from app.models.content import ContentDocument, ContentVersion
from app.services import content_service


CLAIM_TYPES = {
    "price": {"topic": "Pricing", "label": "price"},
    "uptime": {"topic": "Availability commitment", "label": "availability percentage"},
    "performance": {"topic": "Performance claim", "label": "performance multiplier"},
    "savings": {"topic": "Cost-savings claim", "label": "savings percentage"},
}

CURRENCY_RE = re.compile(r"(?<![A-Za-z])(?:₹|\$|€|£|Rs\.?|INR)\s?\d[\d,]*", re.IGNORECASE)
UPTIME_RE = re.compile(
    r"(?i)\b(\d+(?:\.\d+)?)%\s*(?:uptime|availability|sla|service level)"
)
PERFORMANCE_RE = re.compile(r"(?i)\b(\d+(?:\.\d+)?x)\s+(?:faster|quicker|improvement)")
SAVINGS_RE = re.compile(
    r"(?i)\b(\d+(?:\.\d+)?)%\s*(?:reduction|savings|saving|less|lower|cheaper)"
)


def _normalize(claim_type: str, raw: str) -> str:
    if claim_type == "price":
        return re.sub(r"[^\d]", "", raw)
    if claim_type == "performance":
        return raw.lower().rstrip("x")
    return re.sub(r"[^\d.]", "", raw)


def _claim_context(text: str, start: int, end: int) -> str:
    left = max(0, start - 55)
    right = min(len(text), end + 55)
    snippet = re.sub(r"\s+", " ", text[left:right]).strip()
    return f"…{snippet}…"


def extract_document_claims(document: ContentDocument, version: ContentVersion) -> list[dict]:
    claims: list[dict] = []
    segments = version.transcript_segments or []
    pages = version.page_texts or []

    def collect(text: str, location: Optional[str], page: Optional[int], seconds: Optional[float]):
        if not text:
            return
        for match in CURRENCY_RE.finditer(text):
            claims.append(
                {
                    "claim_type": "price",
                    "value": match.group(0),
                    "normalized": _normalize("price", match.group(0)),
                    "location": location,
                    "page_number": page,
                    "timestamp_seconds": seconds,
                    "context": _claim_context(text, match.start(), match.end()),
                }
            )
        for match in UPTIME_RE.finditer(text):
            claims.append(
                {
                    "claim_type": "uptime",
                    "value": f"{match.group(1)}% uptime",
                    "normalized": _normalize("uptime", match.group(1)),
                    "location": location,
                    "page_number": page,
                    "timestamp_seconds": seconds,
                    "context": _claim_context(text, match.start(), match.end()),
                }
            )
        for match in PERFORMANCE_RE.finditer(text):
            claims.append(
                {
                    "claim_type": "performance",
                    "value": match.group(0),
                    "normalized": _normalize("performance", match.group(1)),
                    "location": location,
                    "page_number": page,
                    "timestamp_seconds": seconds,
                    "context": _claim_context(text, match.start(), match.end()),
                }
            )
        for match in SAVINGS_RE.finditer(text):
            claims.append(
                {
                    "claim_type": "savings",
                    "value": match.group(0),
                    "normalized": _normalize("savings", match.group(1)),
                    "location": location,
                    "page_number": page,
                    "timestamp_seconds": seconds,
                    "context": _claim_context(text, match.start(), match.end()),
                }
            )

    if segments:
        for segment in segments:
            seconds = float(segment.get("timestamp_seconds", 0))
            label = f"Timestamp {int(seconds) // 60:02d}:{int(seconds) % 60:02d}"
            collect(segment.get("text", ""), label, None, seconds)
    elif pages:
        for index, page in enumerate(pages, start=1):
            collect(page, f"Page {index}", index, None)
    else:
        collect(version.content_text, "Body", None, None)

    deduped: dict[tuple, dict] = {}
    for claim in claims:
        key = (claim["claim_type"], claim["normalized"], claim["location"])
        deduped.setdefault(key, claim)
    for claim in deduped.values():
        claim["document_id"] = document.id
        claim["document_title"] = document.title
    return list(deduped.values())


def collect_campaign_claims(db: Session, campaign: Campaign) -> tuple[list[dict], list[ContentDocument]]:
    documents = (
        db.query(ContentDocument)
        .filter(ContentDocument.campaign_id == campaign.id)
        .order_by(ContentDocument.created_at)
        .all()
    )
    claims: list[dict] = []
    for document in documents:
        version = content_service.latest_version(db, document.id)
        if version:
            claims.extend(extract_document_claims(document, version))
    return claims, documents


def _approved_reference(
    claims: Iterable[dict], facts: list[ApprovedFact]
) -> tuple[Optional[ApprovedFact], Optional[str]]:
    claim_type = next(iter(claims))["claim_type"] if claims else None
    for fact in facts:
        haystack = f"{fact.category} {fact.claim_statement} {fact.approved_value}".lower()
        if claim_type == "price" and any(k in haystack for k in ("price", "pricing", "commercial")):
            if CURRENCY_RE.search(fact.approved_value):
                return fact, fact.approved_value
        if claim_type == "uptime" and any(k in haystack for k in ("uptime", "sla", "availability")):
            if re.search(r"\d+(?:\.\d+)?%", fact.approved_value):
                return fact, fact.approved_value
        if claim_type == "performance" and any(k in haystack for k in ("faster", "benchmark", "performance")):
            if re.search(r"\d+(?:\.\d+)?x", fact.approved_value, re.IGNORECASE):
                return fact, fact.approved_value
        if claim_type == "savings" and any(k in haystack for k in ("saving", "reduction", "tco", "cost")):
            if re.search(r"\d+(?:\.\d+)?%", fact.approved_value):
                return fact, fact.approved_value
    return None, None


def detect_campaign_conflicts(
    db: Session, campaign: Campaign, *, persist: bool = True
) -> list[dict]:
    claims, _ = collect_campaign_claims(db, campaign)
    facts = (
        db.query(ApprovedFact)
        .filter(
            ApprovedFact.workspace_id == campaign.workspace_id,
            ApprovedFact.is_active.is_(True),
            ApprovedFact.status != "expired",
        )
        .all()
    )
    grouped: dict[str, list[dict]] = defaultdict(list)
    for claim in claims:
        grouped[claim["claim_type"]].append(claim)

    conflicts: list[dict] = []
    seen = set()
    for claim_type, type_claims in grouped.items():
        by_document: dict[str, list[dict]] = defaultdict(list)
        for claim in type_claims:
            by_document[claim["document_id"]].append(claim)
        document_ids = list(by_document.keys())
        for i, doc_a in enumerate(document_ids):
            for doc_b in document_ids[i + 1:]:
                for claim_a in by_document[doc_a]:
                    for claim_b in by_document[doc_b]:
                        if claim_a["normalized"] == claim_b["normalized"]:
                            continue
                        pair = sorted([doc_a, doc_b])
                        key = (
                            claim_type,
                            pair[0],
                            pair[1],
                            tuple(sorted([claim_a["normalized"], claim_b["normalized"]])),
                        )
                        if key in seen:
                            continue
                        seen.add(key)
                        fact, approved_value = _approved_reference([claim_a], facts)
                        if claim_a["document_id"] > claim_b["document_id"]:
                            claim_a, claim_b = claim_b, claim_a
                        conflicts.append(
                            {
                                "claim_type": claim_type,
                                "topic": CLAIM_TYPES[claim_type]["topic"],
                                "asset_a_id": claim_a["document_id"],
                                "asset_a_title": claim_a["document_title"],
                                "asset_a_value": claim_a["value"],
                                "asset_a_location": claim_a["location"],
                                "asset_b_id": claim_b["document_id"],
                                "asset_b_title": claim_b["document_title"],
                                "asset_b_value": claim_b["value"],
                                "asset_b_location": claim_b["location"],
                                "approved_value": approved_value,
                                "source_reference": fact.source_reference if fact else None,
                                "evidence_note": (
                                    f"Both values are quoted from the current saved versions. "
                                    f"“{claim_a['document_title']}” uses {claim_a['value']} at "
                                    f"{claim_a['location']}; “{claim_b['document_title']}” uses "
                                    f"{claim_b['value']} at {claim_b['location']}."
                                    + (
                                        f" The approved record states: {approved_value}."
                                        if approved_value
                                        else " No approved record matches this claim type."
                                    )
                                ),
                            }
                        )

    if persist:
        db.query(CampaignConflict).filter(
            CampaignConflict.campaign_id == campaign.id,
            CampaignConflict.status == "unresolved",
        ).delete(synchronize_session=False)
        for item in conflicts:
            db.add(
                CampaignConflict(
                    campaign_id=campaign.id,
                    status="unresolved",
                    is_demo=campaign.is_demo,
                    **item,
                )
            )
        campaign.updated_at = datetime.now(timezone.utc)
        db.commit()
    return conflicts


def serialize_conflict(conflict: CampaignConflict) -> dict:
    return {
        "id": conflict.id,
        "campaign_id": conflict.campaign_id,
        "claim_type": conflict.claim_type,
        "topic": conflict.topic,
        "asset_a_id": conflict.asset_a_id,
        "asset_a_title": conflict.asset_a_title,
        "asset_a_value": conflict.asset_a_value,
        "asset_a_location": conflict.asset_a_location,
        "asset_b_id": conflict.asset_b_id,
        "asset_b_title": conflict.asset_b_title,
        "asset_b_value": conflict.asset_b_value,
        "asset_b_location": conflict.asset_b_location,
        "approved_value": conflict.approved_value,
        "source_reference": conflict.source_reference,
        "evidence_note": conflict.evidence_note,
        "status": conflict.status,
        "resolution_notes": conflict.resolution_notes,
        "resolved_by": conflict.resolved_by,
        "resolved_at": conflict.resolved_at,
        "is_demo": conflict.is_demo,
        "created_at": conflict.created_at,
    }


def build_readiness(db: Session, campaign: Campaign, conflicts: list) -> dict:
    documents = (
        db.query(ContentDocument)
        .filter(ContentDocument.campaign_id == campaign.id)
        .all()
    )
    unresolved = [c for c in conflicts if c.status == "unresolved"]
    checks: list[dict] = []

    checks.append(
        {
            "key": "cross_asset_consistency",
            "label": "Cross-asset claims agree",
            "status": "passed" if not unresolved else "needs_attention",
            "detail": (
                "No conflicting values were found across the current assets."
                if not unresolved
                else f"{len(unresolved)} conflicting claim(s) remain. Resolve the values in each asset "
                "and re-check."
            ),
        }
    )

    without_checks = []
    critical_open = 0
    stale_approvals = []
    for document in documents:
        version = content_service.latest_version(db, document.id)
        run = content_service.latest_audit_for_version(db, version.id) if version else None
        if not run:
            without_checks.append(document.title)
            continue
        critical_open += (
            db.query(AuditFinding)
            .filter(
                AuditFinding.audit_run_id == run.id,
                AuditFinding.status == "open",
                AuditFinding.severity == "critical",
            )
            .count()
        )
        if not document.approved_version_id or document.approved_version_id != version.id:
            stale_approvals.append(document.title)

    checks.append(
        {
            "key": "checks_completed",
            "label": "Every asset has a current check",
            "status": "passed" if documents and not without_checks else "needs_attention",
            "detail": (
                "All current asset versions have stored audit runs."
                if documents and not without_checks
                else (
                    "No assets are attached to this campaign."
                    if not documents
                    else "No completed check for: " + ", ".join(without_checks) + "."
                )
            ),
        }
    )
    checks.append(
        {
            "key": "critical_findings",
            "label": "No open critical findings",
            "status": "passed" if critical_open == 0 else "needs_attention",
            "detail": (
                "No open critical findings on the current asset versions."
                if critical_open == 0
                else f"{critical_open} open critical finding(s) on current versions."
            ),
        }
    )
    checks.append(
        {
            "key": "current_approvals",
            "label": "Every asset is approved on its current version",
            "status": "passed" if documents and not stale_approvals else "needs_attention",
            "detail": (
                "All assets have a version-bound approval for their latest version."
                if documents and not stale_approvals
                else (
                    "No assets are attached to this campaign."
                    if not documents
                    else "Approval is missing or stale for: " + ", ".join(stale_approvals) + "."
                )
            ),
        }
    )
    checks.append(
        {
            "key": "legal_signoff",
            "label": "Legal and leadership sign-off",
            "status": "manual",
            "detail": (
                "This readiness view checks internal records only. It is not a legal opinion or a "
                "substitute for launch sign-off."
            ),
        }
    )

    if not documents:
        result = "no_assets"
        summary = "Attach at least one asset before assessing launch readiness."
    elif unresolved or critical_open:
        result = "blocked"
        summary = (
            "Launch is blocked by unresolved cross-asset conflicts or open critical findings. "
            "Fix and re-check the affected assets."
        )
    elif without_checks or stale_approvals:
        result = "needs_attention"
        summary = (
            "The campaign is structurally consistent, but some assets still need a current check or "
            "a version-bound approval."
        )
    else:
        result = "ready"
        summary = (
            "All attached assets have current checks, no unresolved conflicts, and version-bound "
            "approvals. Human legal sign-off is still required."
        )
    return {
        "campaign_id": campaign.id,
        "campaign_name": campaign.name,
        "result": result,
        "summary": summary,
        "checks": checks,
        "disclaimer": (
            "Campaign readiness is computed from stored content, audit findings, conflicts, and "
            "approvals. It does not evaluate media placements, budget, or legal clearance."
        ),
    }


def serialize_campaign(db: Session, campaign: Campaign) -> dict:
    documents = (
        db.query(ContentDocument)
        .filter(ContentDocument.campaign_id == campaign.id)
        .order_by(ContentDocument.updated_at.desc())
        .all()
    )
    conflicts = (
        db.query(CampaignConflict)
        .filter(CampaignConflict.campaign_id == campaign.id)
        .order_by(CampaignConflict.created_at.desc())
        .all()
    )
    assets = []
    for document in documents:
        version = content_service.latest_version(db, document.id)
        run = content_service.latest_audit_for_version(db, version.id) if version else None
        assets.append(
            {
                "id": document.id,
                "title": document.title,
                "asset_type": document.asset_type,
                "status": document.status,
                "current_version_number": document.current_version_number,
                "updated_at": document.updated_at,
                "created_by_name": document.created_by_name,
                "latest_score": run.overall_score if run else None,
                "risk_level": run.risk_level if run else None,
                "approval_stale": bool(
                    document.approved_version_id
                    and version
                    and document.approved_version_id != version.id
                ),
            }
        )
    return {
        "id": campaign.id,
        "workspace_id": campaign.workspace_id,
        "name": campaign.name,
        "slug": campaign.slug,
        "description": campaign.description,
        "status": campaign.status,
        "target_audience": campaign.target_audience,
        "launch_target": campaign.launch_target,
        "created_by_name": campaign.created_by_name,
        "is_demo": campaign.is_demo,
        "created_at": campaign.created_at,
        "updated_at": campaign.updated_at,
        "assets_count": len(assets),
        "conflicts_count": len([c for c in conflicts if c.status == "unresolved"]),
        "conflicts": [serialize_conflict(c) for c in conflicts],
        "assets": assets,
        "readiness": build_readiness(db, campaign, conflicts),
    }


def build_graph(db: Session, campaign: Campaign) -> dict:
    documents = (
        db.query(ContentDocument)
        .filter(ContentDocument.campaign_id == campaign.id)
        .all()
    )
    conflicts = (
        db.query(CampaignConflict)
        .filter(
            CampaignConflict.campaign_id == campaign.id,
            CampaignConflict.status == "unresolved",
        )
        .all()
    )
    nodes = [
        {
            "id": campaign.id,
            "label": campaign.name,
            "type": "campaign",
            "status": campaign.status,
            "metadata": {"audience": campaign.target_audience or "Not specified"},
        }
    ]
    links = []
    for document in documents:
        version = content_service.latest_version(db, document.id)
        run = content_service.latest_audit_for_version(db, version.id) if version else None
        nodes.append(
            {
                "id": document.id,
                "label": document.title,
                "type": "asset",
                "status": document.status,
                "metadata": {
                    "asset_type": document.asset_type,
                    "score": run.overall_score if run else None,
                    "version": document.current_version_number,
                },
            }
        )
        links.append({"source": campaign.id, "target": document.id, "relationship": "includes"})

    seen_conflicts = set()
    for conflict in conflicts:
        key = (conflict.topic, conflict.asset_a_value, conflict.asset_b_value)
        if key in seen_conflicts:
            continue
        seen_conflicts.add(key)
        node_id = f"conflict-{conflict.id}"
        nodes.append(
            {
                "id": node_id,
                "label": f"{conflict.topic}: {conflict.asset_a_value} vs {conflict.asset_b_value}",
                "type": "conflict",
                "status": "unresolved",
                "metadata": {
                    "approved_value": conflict.approved_value,
                    "source_reference": conflict.source_reference,
                },
            }
        )
        if conflict.asset_a_id:
            links.append({"source": conflict.asset_a_id, "target": node_id, "relationship": "conflicts"})
        if conflict.asset_b_id:
            links.append({"source": conflict.asset_b_id, "target": node_id, "relationship": "conflicts"})

    conflicts_summary = [
        {
            "topic": conflict.topic,
            "asset_a": conflict.asset_a_title,
            "asset_a_value": conflict.asset_a_value,
            "asset_b": conflict.asset_b_title,
            "asset_b_value": conflict.asset_b_value,
            "approved_value": conflict.approved_value,
            "status": conflict.status,
        }
        for conflict in conflicts
    ]
    return {
        "campaign_id": campaign.id,
        "campaign_name": campaign.name,
        "nodes": nodes,
        "links": links,
        "conflicts_summary": conflicts_summary,
        "detected_now": 0,
    }


def approved_reference_for_claims(facts: list[ApprovedFact], claim_type: str) -> Optional[ApprovedFact]:
    for fact in facts:
        haystack = f"{fact.category} {fact.claim_statement} {fact.approved_value}".lower()
        if claim_type == "price" and any(k in haystack for k in ("price", "pricing")) and CURRENCY_RE.search(fact.approved_value):
            return fact
        if claim_type == "uptime" and any(k in haystack for k in ("uptime", "availability", "sla")):
            return fact
    return None
