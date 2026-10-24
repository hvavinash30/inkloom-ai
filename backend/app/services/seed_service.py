"""Idempotent demo workspace seed.

Everything created here is clearly labeled demo data. The workspace, company,
people, prices, certifications, benchmark, savings study, and customer results
are fictional. The PDF is generated locally and its text is really extractable;
no external benchmarks, surveys, interviews, customers, or citations are
invented. Research entries marked planned were not conducted.
"""
from __future__ import annotations

import hashlib
import json
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import Actor
from app.models.approved_fact import ApprovedFact
from app.models.assets import BrandAsset, EvaluationCase, ResearchRecord, UploadedFile
from app.models.audit import AuditFinding
from app.models.brand_rule import BrandRule
from app.models.campaign import Campaign
from app.models.content import ContentDocument, ContentVersion
from app.models.review import ApprovalDecision, ReviewComment
from app.models.workspace import UserProfile, Workspace
from app.services import campaign_service, content_service, evaluation_service

logger = logging.getLogger("inkloom.seed")

DEMO_WORKSPACE_ID = settings.DEFAULT_WORKSPACE_ID
DEMO_PDF_NAME = "demo-acme-q4-brochure.pdf"

DEMO_PDF_PAGES = [
    "\n".join(
        [
            "Acme Cloud Q4 Enterprise Brochure",
            "Acme Cloud is a fictional enterprise cloud platform for compute, storage, and analytics.",
            "The approved enterprise plan is INR 12,999 per month.",
            "Acme Cloud commits to a 99.9% monthly uptime SLA.",
            "Benchmark tests show up to 3x faster analytics queries than legacy on-premise deployments.",
            "The demo customer value study reports 28% lower infrastructure costs.",
            "Results vary by workload. Benchmark and savings figures are demo data, not guarantees.",
            "This document is fictional demo content created for the Inkloom governance walkthrough.",
        ]
    ),
    "\n".join(
        [
            "Why Acme Cloud Wins",
            "AcmeCloud is the #1 fastest platform in the market.",
            "We deliver 100% uptime for every customer.",
            "AcmeCloud is the cheapest platform for enterprise teams!!!",
            "Move your data today and never worry about reliability again.",
        ]
    ),
    "\n".join(
        [
            "Facts for Reviewers",
            "Approved availability: 99.9% monthly uptime SLA.",
            "Approved enterprise price: INR 12,999 per month.",
            "Compliance status: SOC 2 Type II and ISO 27001, as recorded in the demo trust center.",
            "Results vary by workload. Ask the brand team for approved claims before publishing.",
        ]
    ),
]


def _pdf_escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def _build_demo_pdf(pages: list[str]) -> bytes:
    """Create a small, valid PDF with extractable text (no external deps)."""
    page_ids = [3 + index * 2 for index in range(len(pages))]
    objects: dict[int, bytes] = {}
    objects[1] = b"<< /Type /Catalog /Pages 2 0 R >>"
    kids = " ".join(f"{page_id} 0 R" for page_id in page_ids)
    objects[2] = f"<< /Type /Pages /Kids [{kids}] /Count {len(pages)} >>".encode()
    for index, text in enumerate(pages):
        page_id = page_ids[index]
        content_id = page_id + 1
        objects[page_id] = (
            f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
            f"/Resources << /Font << /F1 20 0 R /F2 21 0 R >> >> "
            f"/Contents {content_id} 0 R >>"
        ).encode()
        lines = text.splitlines()
        operations = ["BT", "/F2 18 Tf", "56 730 Td"]
        for index, line in enumerate(lines):
            if index == 1:
                operations.append("/F1 11 Tf")
            if index > 0:
                operations.append("0 -18 Td")
            operations.append(f"({_pdf_escape(line[:105])}) Tj")
        operations.append("ET")
        stream = "\n".join(operations).encode("latin-1", errors="replace")
        objects[content_id] = (
            f"<< /Length {len(stream)} >>\nstream\n".encode() + stream + b"\nendstream"
        )
    objects[20] = b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
    objects[21] = b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>"

    header = b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n"
    body = bytearray(header)
    offsets: dict[int, int] = {}
    for object_id in sorted(objects):
        offsets[object_id] = len(body)
        body += f"{object_id} 0 obj\n".encode() + objects[object_id] + b"\nendobj\n"
    xref_offset = len(body)
    max_id = max(objects)
    body += f"xref\n0 {max_id + 1}\n".encode()
    body += b"0000000000 65535 f \n"
    for object_id in range(1, max_id + 1):
        if object_id in offsets:
            body += f"{offsets[object_id]:010d} 00000 n \n".encode()
        else:
            body += b"0000000000 65535 f \n"
    body += (
        f"trailer\n<< /Size {max_id + 1} /Root 1 0 R >>\n"
        f"startxref\n{xref_offset}\n%%EOF\n"
    ).encode()
    return bytes(body)


def _ensure_demo_pdf() -> tuple[UploadedFileSeedInfo, str]:
    pages = DEMO_PDF_PAGES
    payload = _build_demo_pdf(pages)
    path = settings.upload_path / DEMO_PDF_NAME
    if not path.exists() or path.read_bytes() != payload:
        path.write_bytes(payload)
    sha = hashlib.sha256(payload).hexdigest()
    info = UploadedFileSeedInfo(
        stored_name=DEMO_PDF_NAME,
        original_name="Acme_Q4_Enterprise_Brochure_Demo.pdf",
        size_bytes=len(payload),
        sha256=sha,
        page_count=len(pages),
        page_texts=pages,
    )
    return info, str(path)


class UploadedFileSeedInfo:
    def __init__(self, *, stored_name, original_name, size_bytes, sha256, page_count, page_texts):
        self.stored_name = stored_name
        self.original_name = original_name
        self.size_bytes = size_bytes
        self.sha256 = sha256
        self.page_count = page_count
        self.page_texts = page_texts


def _actor(user: UserProfile) -> Actor:
    return Actor(user=user, role=user.role, workspace_id=user.workspace_id)


def _record_decision(
    db: Session,
    document: ContentDocument,
    version: ContentVersion,
    reviewer: Actor,
    decision: str,
    feedback: str,
    *,
    created_at: datetime,
) -> ApprovalDecision:
    run = content_service.latest_audit_for_version(db, version.id)
    metadata = {
        "version_number": version.version_number,
        "is_latest_version": True,
        "superseded": False,
        "score_at_decision": run.overall_score if run else None,
        "findings_at_decision": run.total_findings if run else None,
    }
    record = ApprovalDecision(
        document_id=document.id,
        version_id=version.id,
        reviewer_id=reviewer.id,
        reviewer_name=reviewer.name,
        reviewer_role=reviewer.role,
        decision=decision,
        feedback=feedback,
        decision_metadata=metadata,
        created_at=created_at,
    )
    db.add(record)
    content_service.add_history(
        db,
        document,
        user_id=reviewer.id,
        user_name=reviewer.name,
        event_type=f"decision_{decision}",
        description=f"Decision “{decision.replace('_', ' ')}” recorded on version {version.version_number}.",
        version_id=version.id,
        metadata={**metadata, "decision": decision},
    )
    return record


def seed_demo_workspace(db: Session) -> None:
    if db.query(Workspace).filter(Workspace.id == DEMO_WORKSPACE_ID).first():
        return

    logger.info("Seeding the fictional Acme Cloud demo workspace...")
    now = datetime.now(timezone.utc)

    workspace = Workspace(
        id=DEMO_WORKSPACE_ID,
        name=settings.DEFAULT_WORKSPACE_NAME,
        slug="acme-cloud-technologies-demo",
        description=(
            "Fictional B2B cloud platform workspace used to demonstrate Inkloom AI. "
            "Company details, people, prices, claims, benchmarks, and studies are demo data."
        ),
        is_demo=True,
    )
    db.add(workspace)

    admin = UserProfile(
        id="00000000-0000-0000-0000-000000000010",
        workspace_id=DEMO_WORKSPACE_ID,
        email="sarah.chen@acmecloud.demo",
        full_name="Sarah Chen",
        title="Brand Governance Lead",
        role="admin",
        is_demo=True,
    )
    reviewer = UserProfile(
        id="00000000-0000-0000-0000-000000000011",
        workspace_id=DEMO_WORKSPACE_ID,
        email="alex.rivera@acmecloud.demo",
        full_name="Alex Rivera",
        title="Senior Brand Editor",
        role="reviewer",
        is_demo=True,
    )
    creator = UserProfile(
        id="00000000-0000-0000-0000-000000000012",
        workspace_id=DEMO_WORKSPACE_ID,
        email="jordan.patel@acmecloud.demo",
        full_name="Jordan Patel",
        title="Content Marketing Manager",
        role="creator",
        is_demo=True,
    )
    db.add_all([admin, reviewer, creator])
    db.flush()

    facts = [
        ApprovedFact(
            id="00000000-0000-0000-0000-000000000101",
            workspace_id=DEMO_WORKSPACE_ID,
            category="Product Naming",
            claim_statement="Official product name and capitalization",
            approved_value="Acme Cloud (two words, title case)",
            source_reference="Demo Brand Handbook v2.0, section 1 (fictional source)",
            product="Acme Cloud",
            is_active=True,
            status="verified",
            owner_name="Sarah Chen",
            version=2,
            last_reviewed_at=now - timedelta(days=12),
            next_review_at=now + timedelta(days=170),
            is_demo=True,
        ),
        ApprovedFact(
            id="00000000-0000-0000-0000-000000000102",
            workspace_id=DEMO_WORKSPACE_ID,
            category="Product Description",
            claim_statement="Official short product description",
            approved_value=(
                "Acme Cloud is a fictional enterprise cloud platform for compute, storage, and analytics."
            ),
            source_reference="Demo Product Handbook v2.0, section 2 (fictional source)",
            product="Acme Cloud",
            is_active=True,
            status="verified",
            owner_name="Sarah Chen",
            version=1,
            last_reviewed_at=now - timedelta(days=20),
            next_review_at=now + timedelta(days=160),
            is_demo=True,
        ),
        ApprovedFact(
            id="00000000-0000-0000-0000-000000000103",
            workspace_id=DEMO_WORKSPACE_ID,
            category="Service Level & Availability",
            claim_statement="Contractual uptime commitment for the enterprise plan",
            approved_value="99.9% monthly uptime SLA",
            source_reference="Demo Enterprise Master Service Agreement §7.1 (fictional source)",
            product="Acme Cloud Enterprise",
            is_active=True,
            status="verified",
            owner_name="Sarah Chen",
            version=3,
            last_reviewed_at=now - timedelta(days=9),
            next_review_at=now + timedelta(days=81),
            is_demo=True,
        ),
        ApprovedFact(
            id="00000000-0000-0000-0000-000000000104",
            workspace_id=DEMO_WORKSPACE_ID,
            category="Pricing",
            claim_statement="Current enterprise plan list price",
            approved_value="INR 12,999 per month per organization",
            source_reference="Demo FY26 Commercial Rate Card, row 3 (fictional source)",
            product="Acme Cloud Enterprise",
            is_active=True,
            status="verified",
            owner_name="Sarah Chen",
            version=2,
            last_reviewed_at=now - timedelta(days=5),
            next_review_at=now + timedelta(days=85),
            is_demo=True,
        ),
        ApprovedFact(
            id="00000000-0000-0000-0000-000000000105",
            workspace_id=DEMO_WORKSPACE_ID,
            category="Pricing",
            claim_statement="Superseded 2025 list price retained for questions",
            approved_value="INR 9,999 per month per organization",
            source_reference="Demo 2025 Rate Card (superseded; fictional source)",
            product="Acme Cloud Enterprise",
            is_active=True,
            status="expired",
            owner_name="Sarah Chen",
            version=1,
            last_reviewed_at=now - timedelta(days=240),
            is_demo=True,
        ),
        ApprovedFact(
            id="00000000-0000-0000-0000-000000000106",
            workspace_id=DEMO_WORKSPACE_ID,
            category="Performance",
            claim_statement="Analytics query benchmark against legacy on-premise",
            approved_value="Up to 3x faster analytics queries than legacy on-premise deployments",
            source_reference="Demo Benchmark Summary 2026 (fictional internal source)",
            product="Acme Cloud Analytics",
            is_active=True,
            status="verified",
            owner_name="Sarah Chen",
            version=1,
            last_reviewed_at=now - timedelta(days=30),
            next_review_at=now + timedelta(days=150),
            is_demo=True,
        ),
        ApprovedFact(
            id="00000000-0000-0000-0000-000000000107",
            workspace_id=DEMO_WORKSPACE_ID,
            category="Cost & TCO",
            claim_statement="Infrastructure cost reduction in the demo customer study",
            approved_value="28% lower infrastructure costs in the demo customer value study",
            source_reference="Demo Customer Value Study 2026 (fictional internal source)",
            product="Acme Cloud Enterprise",
            is_active=True,
            status="verified",
            owner_name="Sarah Chen",
            version=1,
            last_reviewed_at=now - timedelta(days=30),
            next_review_at=now + timedelta(days=150),
            is_demo=True,
        ),
        ApprovedFact(
            id="00000000-0000-0000-0000-000000000108",
            workspace_id=DEMO_WORKSPACE_ID,
            category="Security & Compliance",
            claim_statement="Certifications recorded in the demo trust center",
            approved_value="SOC 2 Type II and ISO 27001 (demo certifications)",
            source_reference="Demo Trust Center, certifications page (fictional source)",
            product="Acme Cloud",
            is_active=True,
            status="verified",
            owner_name="Sarah Chen",
            version=1,
            last_reviewed_at=now - timedelta(days=45),
            next_review_at=now + timedelta(days=135),
            is_demo=True,
        ),
        ApprovedFact(
            id="00000000-0000-0000-0000-000000000109",
            workspace_id=DEMO_WORKSPACE_ID,
            category="Legal",
            claim_statement="Required disclaimer when benchmark or savings figures appear",
            approved_value=(
                "Results vary by workload. Benchmark and savings figures are demo data, not customer guarantees."
            ),
            source_reference="Demo Legal Guidance §3 (fictional source)",
            product="Acme Cloud",
            is_active=True,
            status="verified",
            owner_name="Sarah Chen",
            version=1,
            last_reviewed_at=now - timedelta(days=15),
            next_review_at=now + timedelta(days=165),
            is_demo=True,
        ),
    ]
    db.add_all(facts)

    rules = [
        BrandRule(
            id="00000000-0000-0000-0000-000000000201",
            workspace_id=DEMO_WORKSPACE_ID,
            name="No absolute uptime promises",
            rule_type="prohibited_phrase",
            description=(
                "Never promise 100% uptime. The approved enterprise commitment is a 99.9% monthly SLA."
            ),
            pattern_or_phrase="100% uptime",
            trigger_phrase=None,
            replacement_or_guidance="Use the approved 99.9% monthly uptime SLA.",
            severity="critical",
            is_active=True,
            status="active",
            owner_name="Sarah Chen",
            version=3,
            last_reviewed_at=now - timedelta(days=9),
            is_demo=True,
        ),
        BrandRule(
            id="00000000-0000-0000-0000-000000000202",
            workspace_id=DEMO_WORKSPACE_ID,
            name="Unsupported market-rank claims",
            rule_type="claim_restriction",
            description=(
                "Rank and superlative claims such as #1 require a current, approved third-party source."
            ),
            pattern_or_phrase="#1",
            trigger_phrase=None,
            replacement_or_guidance="Use a verified differentiator supported by an approved fact.",
            severity="high",
            is_active=True,
            status="active",
            owner_name="Sarah Chen",
            version=2,
            last_reviewed_at=now - timedelta(days=15),
            is_demo=True,
        ),
        BrandRule(
            id="00000000-0000-0000-0000-000000000203",
            workspace_id=DEMO_WORKSPACE_ID,
            name="Measured punctuation and tone",
            rule_type="tone_guideline",
            description="Multiple exclamation marks undermine the measured enterprise tone.",
            pattern_or_phrase="!!!",
            trigger_phrase=None,
            replacement_or_guidance="Use a single period and a calm, factual tone.",
            severity="medium",
            is_active=True,
            status="active",
            owner_name="Sarah Chen",
            version=1,
            last_reviewed_at=now - timedelta(days=60),
            is_demo=True,
        ),
        BrandRule(
            id="00000000-0000-0000-0000-000000000204",
            workspace_id=DEMO_WORKSPACE_ID,
            name="Official product capitalization",
            rule_type="product_naming",
            description="Use “Acme Cloud” with a space. “AcmeCloud” is a legacy spelling.",
            pattern_or_phrase="AcmeCloud",
            trigger_phrase=None,
            replacement_or_guidance="Acme Cloud",
            severity="medium",
            is_active=True,
            status="active",
            owner_name="Sarah Chen",
            version=2,
            last_reviewed_at=now - timedelta(days=12),
            is_demo=True,
        ),
        BrandRule(
            id="00000000-0000-0000-0000-000000000205",
            workspace_id=DEMO_WORKSPACE_ID,
            name="No cheapest-platform positioning",
            rule_type="prohibited_phrase",
            description=(
                "Do not claim Acme Cloud is the cheapest platform. Use value and reliability language instead."
            ),
            pattern_or_phrase="cheapest",
            trigger_phrase=None,
            replacement_or_guidance="cost-effective for enterprise workloads",
            severity="high",
            is_active=True,
            status="active",
            owner_name="Sarah Chen",
            version=1,
            last_reviewed_at=now - timedelta(days=22),
            is_demo=True,
        ),
        BrandRule(
            id="00000000-0000-0000-0000-000000000206",
            workspace_id=DEMO_WORKSPACE_ID,
            name="Disclaimer with pricing",
            rule_type="required_terminology",
            description=(
                "When a price appears in public content, include the approved results disclaimer."
            ),
            pattern_or_phrase="Results vary by workload.",
            trigger_phrase="INR",
            replacement_or_guidance="Append the approved disclaimer from the Legal approved fact.",
            severity="medium",
            is_active=True,
            status="active",
            owner_name="Sarah Chen",
            version=1,
            last_reviewed_at=now - timedelta(days=8),
            is_demo=True,
        ),
        BrandRule(
            id="00000000-0000-0000-0000-000000000207",
            workspace_id=DEMO_WORKSPACE_ID,
            name="Legacy spelling (draft, superseded)",
            rule_type="required_terminology",
            description=(
                "Old draft rule from a previous naming system. It requires “AcmeCloud”, which conflicts "
                "with the active product-naming policy and should not be activated."
            ),
            pattern_or_phrase="AcmeCloud",
            trigger_phrase=None,
            replacement_or_guidance=None,
            severity="low",
            is_active=False,
            status="draft",
            owner_name="Sarah Chen",
            version=1,
            last_reviewed_at=now - timedelta(days=300),
            is_demo=True,
        ),
    ]
    db.add_all(rules)
    db.commit()
    db.refresh(admin)
    db.refresh(reviewer)
    db.refresh(creator)

    admin_actor = _actor(admin)
    reviewer_actor = _actor(reviewer)
    creator_actor = _actor(creator)

    campaign = Campaign(
        id="00000000-0000-0000-0000-000000000301",
        workspace_id=DEMO_WORKSPACE_ID,
        name="Q4 Enterprise Launch",
        slug="q4-enterprise-launch",
        description=(
            "Fictional Q4 campaign used to demonstrate cross-asset consistency checks, review, "
            "and version-bound approvals."
        ),
        status="active",
        target_audience="Enterprise IT and analytics leaders at 500+ seat organizations",
        launch_target=now + timedelta(days=24),
        created_by_name="Sarah Chen",
        is_demo=True,
    )
    db.add(campaign)
    db.flush()

    # Real, viewable PDF with extractable page text.
    pdf_info, _ = _ensure_demo_pdf()
    upload = UploadedFile(
        id="00000000-0000-0000-0000-000000000401",
        workspace_id=DEMO_WORKSPACE_ID,
        original_name=pdf_info.original_name,
        stored_name=pdf_info.stored_name,
        mime_type="application/pdf",
        size_bytes=pdf_info.size_bytes,
        kind="pdf",
        sha256=pdf_info.sha256,
        extraction_status="processed",
        extraction_message=(
            f"Extracted text from {pdf_info.page_count} page(s). Page numbers are preserved on findings."
        ),
        page_count=pdf_info.page_count,
        page_texts=pdf_info.page_texts,
        extracted_text="\n\f\n".join(pdf_info.page_texts),
        uploaded_by_id=creator.id,
        uploaded_by_name=creator.full_name,
        is_demo=True,
    )
    db.add(upload)
    db.commit()
    db.refresh(upload)

    pdf_doc, pdf_v1 = content_service.create_document(
        db,
        creator_actor,
        title="Q4 Enterprise Brochure (PDF)",
        content_type="product_copy",
        content_text="",
        asset_type="pdf",
        campaign_id=campaign.id,
        source_url=None,
        upload=upload,
        page_texts=pdf_info.page_texts,
        save_as_draft=False,
    )
    content_service.run_and_store_audit(db, pdf_doc, pdf_v1, creator_actor, upload=upload)

    social_text = (
        "Meet AcmeCloud: the #1 fastest enterprise cloud, now at just INR 11,499 per month with "
        "100% uptime!!! Our industry-leading platform is ready for every team."
    )
    social_doc, social_v1 = content_service.create_document(
        db,
        creator_actor,
        title="LinkedIn Launch Post",
        content_type="social_media",
        content_text=social_text,
        asset_type="text",
        campaign_id=campaign.id,
        source_url=None,
        upload=None,
        save_as_draft=False,
    )
    content_service.run_and_store_audit(db, social_doc, social_v1, creator_actor)
    social_doc.status = "changes_requested"
    social_doc.submitted_at = now - timedelta(hours=21)
    social_doc.submitted_by_name = creator.full_name
    db.add(
        ReviewComment(
            document_id=social_doc.id,
            version_id=social_v1.id,
            user_id=reviewer.id,
            author_name=reviewer.full_name,
            author_role=reviewer.role,
            visibility="shared",
            comment_text=(
                "Please use the approved INR 12,999 price and the 99.9% SLA. Remove the #1 and "
                "100% uptime claims, and fix the AcmeCloud spelling before resubmitting."
            ),
            created_at=now - timedelta(hours=17),
        )
    )
    db.add(
        ReviewComment(
            document_id=social_doc.id,
            version_id=social_v1.id,
            user_id=reviewer.id,
            author_name=reviewer.full_name,
            author_role=reviewer.role,
            visibility="internal",
            comment_text="Pricing difference also needs finance confirmation before the next review.",
            created_at=now - timedelta(hours=16),
        )
    )
    _record_decision(
        db,
        social_doc,
        social_v1,
        reviewer_actor,
        "changes_requested",
        (
            "The post uses a price that differs from the approved rate card, an absolute uptime "
            "claim, an unsupported #1 claim, and the legacy product spelling. Please revise."
        ),
        created_at=now - timedelta(hours=17),
    )
    content_service.add_history(
        db,
        social_doc,
        user_id=creator.id,
        user_name=creator.full_name,
        event_type="submitted_for_review",
        description=f"Submitted version {social_v1.version_number} for brand review.",
        version_id=social_v1.id,
        metadata={"version_number": social_v1.version_number},
    )
    db.commit()

    email_v1_text = (
        "Hello,\n\nAcme Cloud Enterprise is available for INR 12,999 per month. The plan includes "
        "a 99.9% monthly uptime SLA and access to the analytics workspace described in our "
        "product handbook.\n\nResults vary by workload.\n\n- The Acme Cloud team"
    )
    email_doc, email_v1 = content_service.create_document(
        db,
        creator_actor,
        title="Enterprise Launch Email",
        content_type="email_campaign",
        content_text=email_v1_text,
        asset_type="text",
        campaign_id=campaign.id,
        source_url=None,
        upload=None,
        save_as_draft=False,
    )
    content_service.run_and_store_audit(db, email_doc, email_v1, creator_actor)
    email_doc.status = "approved"
    email_doc.approved_version_id = email_v1.id
    _record_decision(
        db,
        email_doc,
        email_v1,
        reviewer_actor,
        "approved",
        "Approved version 1. Price, SLA, and disclaimer match the approved records.",
        created_at=now - timedelta(days=3),
    )
    db.commit()

    email_v2_text = (
        "Hello,\n\nAcme Cloud Enterprise now includes the analytics workspace and a 99.9% monthly "
        "uptime SLA. The plan is INR 12,999 per month, and onboarding support is included.\n\n"
        "Results vary by workload.\n\n- The Acme Cloud team"
    )
    email_v2, _ = content_service.create_new_version(
        db,
        email_doc,
        creator_actor,
        content_text=email_v2_text,
        change_summary="Refined launch email after partner feedback",
    )
    email_doc.status = "in_review"
    email_doc.submitted_at = now - timedelta(hours=6)
    email_doc.submitted_by_name = creator.full_name
    content_service.add_history(
        db,
        email_doc,
        user_id=creator.id,
        user_name=creator.full_name,
        event_type="submitted_for_review",
        description=f"Submitted version {email_v2.version_number} for review.",
        version_id=email_v2.id,
        metadata={"version_number": email_v2.version_number},
    )
    db.commit()

    segments = [
        {"timestamp_seconds": 18.0, "timestamp_label": "00:18", "text": "Welcome to the Acme Cloud Q4 launch for enterprise teams."},
        {"timestamp_seconds": 42.0, "timestamp_label": "00:42", "text": "Our platform delivers 100% uptime, all year round."},
        {"timestamp_seconds": 75.0, "timestamp_label": "01:15", "text": "AcmeCloud is the #1 fastest cloud for analytics!!!"},
        {"timestamp_seconds": 108.0, "timestamp_label": "01:48", "text": "The enterprise plan is INR 12,999 per month."},
        {"timestamp_seconds": 130.0, "timestamp_label": "02:10", "text": "Approved availability is 99.9% under the enterprise SLA, and results vary by workload."},
        {"timestamp_seconds": 145.0, "timestamp_label": "02:25", "text": "Our industry-leading support team is available around the clock."},
    ]
    video_text = "\n".join(
        f"[{segment['timestamp_label']}] {segment['text']}" for segment in segments
    )
    video_doc, video_v1 = content_service.create_document(
        db,
        creator_actor,
        title="Launch Webinar (transcript only)",
        content_type="video_script",
        content_text=video_text,
        asset_type="video",
        campaign_id=None,
        source_url=None,
        upload=None,
        transcript_segments=segments,
        save_as_draft=False,
    )
    content_service.run_and_store_audit(db, video_doc, video_v1, creator_actor)
    video_doc.status = "in_review"
    video_doc.submitted_at = now - timedelta(hours=10)
    video_doc.submitted_by_name = creator.full_name
    db.add(
        ReviewComment(
            document_id=video_doc.id,
            version_id=video_v1.id,
            user_id=creator.id,
            author_name=creator.full_name,
            author_role=creator.role,
            visibility="shared",
            comment_text=(
                "No video file was uploaded for this demo entry. These checks use the timestamped "
                "transcript only. Timestamps are stored on the findings."
            ),
            created_at=now - timedelta(hours=10),
        )
    )
    content_service.add_history(
        db,
        video_doc,
        user_id=creator.id,
        user_name=creator.full_name,
        event_type="submitted_for_review",
        description=f"Submitted version {video_v1.version_number} for review (transcript only).",
        version_id=video_v1.id,
        metadata={"version_number": video_v1.version_number, "video_file_present": False},
    )
    db.commit()

    draft_doc, _ = content_service.create_document(
        db,
        creator_actor,
        title="Partner One-Pager (draft)",
        content_type="product_copy",
        content_text=(
            "Acme Cloud gives partners a clear path to enterprise analytics. Draft outline only; "
            "claims and pricing still need brand approval."
        ),
        asset_type="text",
        campaign_id=None,
        source_url=None,
        upload=None,
        save_as_draft=True,
    )

    clean_text = (
        "Acme Cloud is a fictional enterprise cloud platform for compute, storage, and analytics. "
        "The approved enterprise plan is INR 12,999 per month. Acme Cloud commits to a 99.9% "
        "monthly uptime SLA. Benchmark tests show up to 3x faster analytics queries than legacy "
        "on-premise deployments, and the demo customer study reports 28% lower infrastructure "
        "costs. Results vary by workload."
    )
    clean_doc, clean_v1 = content_service.create_document(
        db,
        creator_actor,
        title="Platform Overview (approved)",
        content_type="landing_page",
        content_text=clean_text,
        asset_type="text",
        campaign_id=None,
        source_url=None,
        upload=None,
        save_as_draft=False,
    )
    content_service.run_and_store_audit(db, clean_doc, clean_v1, creator_actor)
    clean_doc.status = "approved"
    clean_doc.approved_version_id = clean_v1.id
    clean_doc.submitted_at = now - timedelta(days=1, hours=2)
    clean_doc.submitted_by_name = creator.full_name
    _record_decision(
        db,
        clean_doc,
        clean_v1,
        reviewer_actor,
        "approved",
        "Approved. Claims are limited to the recorded facts and the disclaimer is present.",
        created_at=now - timedelta(days=1),
    )
    db.commit()

    campaign_service.detect_campaign_conflicts(db, campaign)

    brand_assets = [
        BrandAsset(
            workspace_id=DEMO_WORKSPACE_ID,
            name="Deep Navy",
            asset_type="color",
            value="#0F172A",
            notes="Primary brand color for headers, navigation, and primary text.",
            status="active",
            owner_name="Sarah Chen",
            is_demo=True,
        ),
        BrandAsset(
            workspace_id=DEMO_WORKSPACE_ID,
            name="Signal Blue",
            asset_type="color",
            value="#2563EB",
            notes="Accent color for links and primary actions. Check contrast before use.",
            status="active",
            owner_name="Sarah Chen",
            is_demo=True,
        ),
        BrandAsset(
            workspace_id=DEMO_WORKSPACE_ID,
            name="Soft Canvas",
            asset_type="color",
            value="#F8FAFC",
            notes="Background tint for content surfaces.",
            status="active",
            owner_name="Sarah Chen",
            is_demo=True,
        ),
        BrandAsset(
            workspace_id=DEMO_WORKSPACE_ID,
            name="Muted Slate",
            asset_type="color",
            value="#64748B",
            notes="Secondary text. Verify contrast for small copy.",
            status="active",
            owner_name="Sarah Chen",
            is_demo=True,
        ),
        BrandAsset(
            workspace_id=DEMO_WORKSPACE_ID,
            name="Editorial Sans",
            asset_type="typography",
            value='Inter, "Segoe UI", system-ui, sans-serif',
            notes="Primary interface and body typeface. Use 16px or larger for body copy.",
            status="active",
            owner_name="Sarah Chen",
            is_demo=True,
        ),
        BrandAsset(
            workspace_id=DEMO_WORKSPACE_ID,
            name="Data Mono",
            asset_type="typography",
            value='"JetBrains Mono", ui-monospace, monospace',
            notes="Use sparingly for evidence excerpts and timestamps.",
            status="active",
            owner_name="Sarah Chen",
            is_demo=True,
        ),
        BrandAsset(
            workspace_id=DEMO_WORKSPACE_ID,
            name="Q4 Launch Brief Template",
            asset_type="template",
            value="Outline: positioning, approved claims, proof, legal disclaimer, review owners.",
            notes="A template outline, not an uploaded design file.",
            status="active",
            owner_name="Sarah Chen",
            is_demo=True,
        ),
    ]
    db.add_all(brand_assets)

    research_records = [
        ResearchRecord(
            workspace_id=DEMO_WORKSPACE_ID,
            section="literature",
            title="Public standards review: accessibility and advertising claims",
            status="completed",
            summary=(
                "Reviewed public standards and regulatory guidance that inform the governance "
                "requirements. No survey, interview, or customer study was conducted for this demo."
            ),
            details=json.dumps(
                {
                    "scope": [
                        "WCAG 2.2 contrast requirements for text and non-text content",
                        "FTC guidance on substantiating advertising claims",
                        "NIST AI Risk Management Framework for governance traceability",
                    ],
                    "method": "Desk review of the linked public documents.",
                    "limitations": "This is a demo requirements review, not legal advice or a benchmark.",
                }
            ),
            sources=json.dumps(
                [
                    {
                        "title": "W3C Web Content Accessibility Guidelines (WCAG) 2.2",
                        "url": "https://www.w3.org/TR/WCAG22/",
                        "publisher": "W3C",
                    },
                    {
                        "title": "FTC Advertising FAQs: A Guide for Small Business",
                        "url": "https://www.ftc.gov/business-guidance/resources/advertising-faqs-guide-small-business",
                        "publisher": "U.S. Federal Trade Commission",
                    },
                    {
                        "title": "NIST AI Risk Management Framework",
                        "url": "https://www.nist.gov/itl/ai-risk-management-framework",
                        "publisher": "NIST",
                    },
                ]
            ),
            owner_name="Sarah Chen",
            is_demo=True,
        ),
        ResearchRecord(
            workspace_id=DEMO_WORKSPACE_ID,
            section="traceability",
            title="Requirement traceability for the demo workflow",
            status="completed",
            summary=(
                "Mapped the demo requirements to implemented workflows and evaluation cases. "
                "This trace is internal to the build and does not claim external certification."
            ),
            details=json.dumps(
                {
                    "mappings": [
                        {
                            "requirement": "Findings must cite evidence",
                            "implementation": "Findings store rule/fact IDs, source references, location, and status.",
                            "verification": "Evaluation case: uptime contradiction and product naming.",
                        },
                        {
                            "requirement": "PDF findings must preserve page numbers",
                            "implementation": "Extracted page text is audited per page and findings store page_number.",
                            "verification": "Evaluation case: PDF page location.",
                        },
                        {
                            "requirement": "Approvals must be version-aware",
                            "implementation": "Decisions store version_id; document approval staleness is compared to the latest version.",
                            "verification": "Seeded Enterprise Launch Email has an approved v1 and an in-review v2.",
                        },
                        {
                            "requirement": "No invented AI verification",
                            "implementation": "Audits use deterministic rules and approved facts; optional AI/OCR/transcription status is reported separately.",
                            "verification": "Processing-issue behavior for images and videos without transcripts.",
                        },
                    ],
                    "limitations": [
                        "No production authentication provider is connected.",
                        "No OCR or speech-to-text service is configured.",
                        "Evaluation fixtures are synthetic and not an external benchmark.",
                    ],
                }
            ),
            sources=json.dumps(
                [
                    {
                        "title": "Inkloom AI project README and implementation",
                        "url": "",
                        "publisher": "Local demo repository",
                    }
                ]
            ),
            owner_name="Sarah Chen",
            is_demo=True,
        ),
        ResearchRecord(
            workspace_id=DEMO_WORKSPACE_ID,
            section="survey",
            title="Planned creator workflow survey",
            status="planned",
            summary=(
                "Planned discovery survey of brand and content practitioners. It has not been "
                "conducted, and no responses, sample size, or findings exist."
            ),
            details=json.dumps(
                {
                    "planned_method": "Short survey on review turnaround and evidence needs.",
                    "target_participants": "Brand, content, and compliance practitioners.",
                    "fields": ["role", "review volume", "biggest approval bottleneck", "evidence needs"],
                    "results": None,
                    "honesty_note": "Not conducted. Do not present as completed research.",
                }
            ),
            sources=json.dumps([]),
            owner_name="Sarah Chen",
            is_demo=True,
        ),
        ResearchRecord(
            workspace_id=DEMO_WORKSPACE_ID,
            section="interviews",
            title="Planned reviewer interviews",
            status="planned",
            summary=(
                "Planned interview guide for reviewers. No interviews have been scheduled or "
                "completed, and no quotes or participants are represented."
            ),
            details=json.dumps(
                {
                    "planned_protocol": [
                        "How reviewers receive content and evidence today",
                        "Where version confusion occurs",
                        "What a trustworthy approval record must contain",
                    ],
                    "participants_recruited": 0,
                    "interviews_completed": 0,
                    "results": None,
                }
            ),
            sources=json.dumps([]),
            owner_name="Sarah Chen",
            is_demo=True,
        ),
        ResearchRecord(
            workspace_id=DEMO_WORKSPACE_ID,
            section="competitor",
            title="Competitor research framework",
            status="planned",
            summary=(
                "A comparison framework is drafted, but no competitor product was tested and no "
                "vendor claims are recorded."
            ),
            details=json.dumps(
                {
                    "comparison_dimensions": [
                        "Evidence visibility on findings",
                        "Version-bound approval records",
                        "PDF page-level review",
                        "Cross-asset claim consistency",
                    ],
                    "data_collection_started": False,
                    "note": "No competitor names, pricing, or performance claims are included.",
                }
            ),
            sources=json.dumps([]),
            owner_name="Sarah Chen",
            is_demo=True,
        ),
        ResearchRecord(
            workspace_id=DEMO_WORKSPACE_ID,
            section="validation",
            title="Internal evaluation plan (synthetic fixtures)",
            status="in_progress",
            summary=(
                "The evaluation harness runs deterministic engine cases against the workspace's "
                "current rules and facts. Only measured passes and failures are reported."
            ),
            details=json.dumps(
                {
                    "method": "Run the evaluation page to execute each case; compare expected and actual findings.",
                    "metrics": ["case status", "findings count", "location match", "category match"],
                    "out_of_scope": [
                        "External benchmark accuracy",
                        "Production traffic",
                        "Legal correctness",
                    ],
                    "honesty_note": "Pass rates are only meaningful for the listed synthetic fixtures.",
                }
            ),
            sources=json.dumps([]),
            owner_name="Sarah Chen",
            is_demo=True,
        ),
    ]
    db.add_all(research_records)

    db.commit()

    evaluation_cases = [
        EvaluationCase(
            workspace_id=DEMO_WORKSPACE_ID,
            name="Clean approved copy",
            description="Approved wording with matched facts and the required disclaimer.",
            case_type="text",
            input_payload=json.dumps(
                {
                    "content_text": (
                        "Acme Cloud offers a 99.9% monthly uptime SLA for INR 12,999 per month. "
                        "Results vary by workload."
                    )
                }
            ),
            expected_outcome=json.dumps({"expect_clean": True}),
            expected_summary="No findings; approved values and disclaimer present.",
            version=1,
            is_demo=True,
        ),
        EvaluationCase(
            workspace_id=DEMO_WORKSPACE_ID,
            name="Absolute uptime contradiction",
            description="100% uptime contradicts the approved 99.9% SLA and violates a critical rule.",
            case_type="text",
            input_payload=json.dumps(
                {"content_text": "Our platform guarantees 100% uptime for every customer."}
            ),
            expected_outcome=json.dumps(
                {
                    "must_include_categories": ["confirmed_contradiction"],
                    "must_include_text": ["100%"],
                }
            ),
            expected_summary="A confirmed contradiction is linked to the approved SLA fact.",
            version=1,
            is_demo=True,
        ),
        EvaluationCase(
            workspace_id=DEMO_WORKSPACE_ID,
            name="Legacy product spelling",
            description="AcmeCloud triggers the active product-naming policy.",
            case_type="text",
            input_payload=json.dumps({"content_text": "Meet AcmeCloud, the enterprise cloud platform."}),
            expected_outcome=json.dumps(
                {
                    "must_include_categories": ["policy_violation"],
                    "must_include_text": ["AcmeCloud"],
                }
            ),
            expected_summary="A brand policy finding cites the active naming rule.",
            version=1,
            is_demo=True,
        ),
        EvaluationCase(
            workspace_id=DEMO_WORKSPACE_ID,
            name="PDF finding preserves page number",
            description="A violation appears only on page 2 and the finding keeps that location.",
            case_type="pdf",
            input_payload=json.dumps(
                {
                    "page_texts": [
                        "Page one is safe approved copy.",
                        "AcmeCloud is the #1 fastest platform.",
                    ]
                }
            ),
            expected_outcome=json.dumps(
                {
                    "must_include_categories": ["unsupported_claim"],
                    "must_include_text": ["#1"],
                    "expected_page": 2,
                }
            ),
            expected_summary="Unsupported #1 claim is located on page 2.",
            version=1,
            is_demo=True,
        ),
        EvaluationCase(
            workspace_id=DEMO_WORKSPACE_ID,
            name="Transcript timestamp preserved",
            description="A timestamped transcript produces a finding at the spoken timestamp.",
            case_type="video",
            input_payload=json.dumps(
                {
                    "content_text": "",
                    "transcript_segments": [
                        {"timestamp_seconds": 42.0, "text": "We deliver 100% uptime."}
                    ],
                }
            ),
            expected_outcome=json.dumps(
                {
                    "must_include_categories": ["confirmed_contradiction"],
                    "must_include_text": ["100%"],
                    "expected_timestamp_seconds": 42,
                }
            ),
            expected_summary="The finding is tied to timestamp 00:42.",
            version=1,
            is_demo=True,
        ),
    ]
    db.add_all(evaluation_cases)
    db.commit()
    evaluation_service.run_all_cases(db, DEMO_WORKSPACE_ID)

    logger.info("Acme Cloud demo workspace seeded with audits, reviews, conflicts, and cases.")
