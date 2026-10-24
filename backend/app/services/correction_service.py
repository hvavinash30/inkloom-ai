"""AI-assisted correction suggestions, grounded in stored records.

Given a stored finding, this service assembles the original passage, the
applicable brand rule and approved fact, and the surrounding content, then asks
the configured provider to propose a replacement. It never mutates the finding
or the content: the suggestion is advisory until a human applies it, which
creates a new version through the existing versioning workflow.

When no provider is configured, or when a provider call fails, it returns a
deterministic suggestion derived from the stored rule guidance and approved
fact, clearly labelled ``rule_based``. It never presents fallback output as a
model response.
"""
from __future__ import annotations

import logging
from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import Actor
from app.models.approved_fact import ApprovedFact
from app.models.audit import AuditFinding
from app.models.brand_rule import BrandRule
from app.models.content import ContentDocument, ContentVersion
from app.services import ai_provider, content_service

logger = logging.getLogger("inkloom.correction")

SYSTEM_PROMPT = (
    "You are a brand governance assistant inside a review workflow. You propose a single "
    "corrected passage of marketing text that resolves one specific flagged issue.\n"
    "Rules you must follow:\n"
    "1. Use ONLY the brand rules and approved facts provided. Do not invent facts, figures, "
    "statistics, certifications, product names, or sources.\n"
    "2. If the issue cannot be resolved with the provided material, set suggested_text to an "
    "empty string and explain what information is missing in rationale.\n"
    "3. Preserve the author's intent and language. Change only what is needed.\n"
    "4. Reply with a single JSON object and nothing else, using exactly these keys:\n"
    '   {"suggested_text": string, "rationale": string, "cited_rule_ids": string[], '
    '"cited_fact_ids": string[], "cautions": string[]}\n'
    "5. cited_rule_ids and cited_fact_ids may only contain ids from the provided lists. Use [] "
    "when nothing applies. Never use an id you were not given."
)


def _context_block(
    finding: AuditFinding,
    rule: Optional[BrandRule],
    fact: Optional[ApprovedFact],
    workspace_rules: list[BrandRule],
    workspace_facts: list[ApprovedFact],
) -> str:
    lines: list[str] = []
    lines.append(f"FLAGGED ISSUE\nTitle: {finding.title}\nCategory: {finding.category}")
    lines.append(f"Severity: {finding.severity}\nWhy it was flagged: {finding.explanation}")
    lines.append(f'Flagged text: "{finding.affected_text}"')
    if finding.location_label:
        lines.append(f"Location: {finding.location_label}")
    if rule:
        lines.append(
            f'\nMATCHED BRAND RULE\nid={rule.id}\nname={rule.name}\ntype={rule.rule_type}\n'
            f'pattern="{rule.pattern_or_phrase}"\nguidance="{rule.replacement_or_guidance or ""}"'
        )
    if fact:
        lines.append(
            f"\nMATCHED APPROVED FACT\nid={fact.id}\ncategory={fact.category}\n"
            f'claim={fact.claim_statement}\napproved_value="{fact.approved_value}"\n'
            f"source={fact.source_reference}"
        )
    if workspace_rules:
        lines.append("\nAVAILABLE BRAND RULES (id — name — guidance):")
        for item in workspace_rules[:20]:
            lines.append(f'- {item.id} — {item.name} — "{item.replacement_or_guidance or item.pattern_or_phrase}"')
    if workspace_facts:
        lines.append("\nAVAILABLE APPROVED FACTS (id — claim — approved value):")
        for item in workspace_facts[:20]:
            lines.append(f'- {item.id} — {item.claim_statement} — "{item.approved_value}"')
    return "\n".join(lines)


def _passage(version: Optional[ContentVersion], finding: AuditFinding) -> tuple[str, bool]:
    """Return the exact passage and whether it is a verified verbatim span."""
    source = (version.content_text if version else "") or ""
    start, end = finding.start_index or 0, finding.end_index or 0
    if (
        source
        and finding.affected_text
        and 0 <= start < end <= len(source)
        and source[start:end] == finding.affected_text
    ):
        return finding.affected_text, True
    # Fall back to the stored text only when it appears verbatim in the version.
    if source and finding.affected_text and finding.affected_text in source:
        return finding.affected_text, True
    return finding.affected_text, False


def _citations(
    rule: Optional[BrandRule], fact: Optional[ApprovedFact], cited_rule_ids, cited_fact_ids, workspace_rules, workspace_facts
) -> list[dict]:
    rule_index = {item.id: item for item in workspace_rules}
    fact_index = {item.id: item for item in workspace_facts}
    if rule:
        rule_index[rule.id] = rule
    if fact:
        fact_index[fact.id] = fact

    citations: list[dict] = []
    seen: set[tuple[str, str]] = set()
    for rule_id in cited_rule_ids:
        item = rule_index.get(rule_id)
        if not item or ("brand_rule", item.id) in seen:
            continue
        seen.add(("brand_rule", item.id))
        citations.append(
            {
                "kind": "brand_rule",
                "id": item.id,
                "label": item.name,
                "detail": item.replacement_or_guidance or item.pattern_or_phrase,
                "source_reference": f"Brand policy: {item.name} (v{item.version})",
            }
        )
    for fact_id in cited_fact_ids:
        item = fact_index.get(fact_id)
        if not item or ("approved_fact", item.id) in seen:
            continue
        seen.add(("approved_fact", item.id))
        citations.append(
            {
                "kind": "approved_fact",
                "id": item.id,
                "label": item.claim_statement,
                "detail": item.approved_value,
                "source_reference": item.source_reference,
            }
        )
    return citations


def _deterministic_suggestion(
    finding: AuditFinding, rule: Optional[BrandRule], fact: Optional[ApprovedFact]
) -> tuple[str, str]:
    if fact:
        guidance = (
            f'This contradicts the approved fact "{fact.claim_statement}" '
            f'(approved value: "{fact.approved_value}", source: {fact.source_reference}). '
            "Replace the statement with wording consistent with the approved value."
        )
    elif rule:
        guidance = (
            f'This matches the brand rule "{rule.name}". '
            + (f'Use the rule guidance: "{rule.replacement_or_guidance}".' if rule.replacement_or_guidance else "")
        )
    else:
        guidance = finding.explanation or "Review and rewrite this passage to satisfy the stored policy."

    suggested = (finding.suggested_correction or "").strip()
    if not suggested and rule and rule.replacement_or_guidance:
        suggested = rule.replacement_or_guidance.strip()
    if not suggested and fact:
        suggested = fact.approved_value.strip()
    return suggested, guidance


def suggest_correction(
    db: Session,
    actor: Actor,
    finding_id: str,
    *,
    reviewer_notes: Optional[str] = None,
    record_event: bool = True,
) -> dict:
    """Build a grounded correction suggestion for a finding. Never mutates content."""
    finding = db.query(AuditFinding).filter(AuditFinding.id == finding_id).first()
    if not finding:
        raise HTTPException(status_code=404, detail="Finding not found.")
    run = finding.audit_run
    if not run:
        raise HTTPException(status_code=404, detail="The audit run for this finding was not found.")
    document = (
        db.query(ContentDocument)
        .filter(
            ContentDocument.id == run.document_id,
            ContentDocument.workspace_id == actor.workspace_id,
        )
        .first()
    )
    if not document:
        raise HTTPException(status_code=404, detail="Content item not found.")
    if not actor.can_edit_document(document):
        raise HTTPException(
            status_code=403,
            detail="You do not have permission to prepare corrections for this content.",
        )

    version = (
        db.query(ContentVersion).filter(ContentVersion.id == finding.version_id).first()
    )
    rule = db.query(BrandRule).filter(BrandRule.id == finding.rule_id).first() if finding.rule_id else None
    fact = db.query(ApprovedFact).filter(ApprovedFact.id == finding.fact_id).first() if finding.fact_id else None
    workspace_rules = (
        db.query(BrandRule)
        .filter(BrandRule.workspace_id == actor.workspace_id, BrandRule.is_active.is_(True))
        .all()
    )
    workspace_facts = (
        db.query(ApprovedFact)
        .filter(ApprovedFact.workspace_id == actor.workspace_id, ApprovedFact.is_active.is_(True))
        .all()
    )

    original_text, exact_span = _passage(version, finding)

    mode = "rule_based"
    provider = None
    model = None
    provider_error: Optional[dict] = None
    suggested_text = ""
    rationale = ""
    cautions: list[str] = []
    cited_rule_ids: list[str] = []
    cited_fact_ids: list[str] = []

    if ai_provider.is_configured():
        if not ai_provider.allow_request(f"correction:{actor.id}"):
            provider_error = {
                "kind": ai_provider.RATE_LIMITED,
                "message": (
                    f"AI suggestion requests are limited to {settings.AI_RATE_LIMIT_PER_MINUTE} "
                    "per minute. Try again shortly."
                ),
            }
        else:
            user_prompt = _context_block(finding, rule, fact, workspace_rules, workspace_facts)
            if reviewer_notes:
                user_prompt += f"\n\nREVIEWER NOTES\n{reviewer_notes.strip()[:600]}"
            response, parsed = ai_provider.complete_json(
                SYSTEM_PROMPT, user_prompt, required_keys=("suggested_text", "rationale")
            )
            if response.ok and parsed is not None:
                candidate = str(parsed.get("suggested_text") or "").strip()
                allowed_rules = {item.id for item in workspace_rules} | ({rule.id} if rule else set())
                allowed_facts = {item.id for item in workspace_facts} | ({fact.id} if fact else set())
                raw_rule_ids = [str(x) for x in (parsed.get("cited_rule_ids") or [])][:6]
                raw_fact_ids = [str(x) for x in (parsed.get("cited_fact_ids") or [])][:6]
                unknown = [x for x in raw_rule_ids + raw_fact_ids if x not in allowed_rules | allowed_facts]
                if unknown:
                    cautions.append(
                        "The model referenced record id(s) that are not stored in this workspace; "
                        "those references were discarded."
                    )
                cited_rule_ids = [x for x in raw_rule_ids if x in allowed_rules]
                cited_fact_ids = [x for x in raw_fact_ids if x in allowed_facts]
                cautions.extend(str(x)[:300] for x in (parsed.get("cautions") or []) if str(x).strip())
                mode = "ai"
                provider = response.provider
                model = response.model
                suggested_text = candidate
                rationale = str(parsed.get("rationale") or "").strip()
                if not cited_rule_ids and not cited_fact_ids:
                    cautions.append(
                        "The model did not cite a stored rule or approved fact for this suggestion. "
                        "Verify it against the Brand Library before applying it."
                    )
            else:
                provider_error = {"kind": response.error_kind, "message": response.error_message}
                logger.info(
                    "correction ai unavailable kind=%s provider=%s", response.error_kind, response.provider
                )
    else:
        provider_error = {
            "kind": ai_provider.NOT_CONFIGURED,
            "message": settings.ai_status_reason,
        }

    if mode != "ai":
        suggested_text, rationale = _deterministic_suggestion(finding, rule, fact)
        cited_rule_ids = [rule.id] if rule else []
        cited_fact_ids = [fact.id] if fact else []

    citations = _citations(
        rule, fact, cited_rule_ids, cited_fact_ids, workspace_rules, workspace_facts
    )

    limitations = [
        "AI and rule-based suggestions are drafting aids. They are not verified proof and are not "
        "an approval decision.",
        "The deterministic audit engine remains the source of rule-based findings; this suggestion "
        "does not change any finding.",
        "Applying a suggestion creates a new version through the normal workflow and re-runs the "
        "audit. Any earlier approval then becomes stale until a reviewer approves the new version.",
    ]
    if mode != "ai":
        limitations.insert(0, "This suggestion was produced by the deterministic rule engine, not a language model.")
    if not exact_span:
        limitations.append(
            "The flagged passage could not be matched verbatim in the stored version, so it is "
            "shown as recorded rather than from an exact source span."
        )

    if record_event:
        try:
            actor_name = actor.name
            kind_label = "AI-assisted" if mode == "ai" else "rule-based"
            content_service.add_history(
                db,
                document,
                user_id=actor.id,
                user_name=actor_name,
                event_type="correction_suggested",
                description=f"{kind_label} correction suggestion prepared for finding “{finding.title}”.",
                version_id=finding.version_id,
                metadata={
                    "finding_id": finding.id,
                    "mode": mode,
                    "provider": provider,
                    "suggested": bool(suggested_text),
                },
            )
            db.commit()
        except Exception:  # history is best-effort; never block the suggestion
            db.rollback()
            logger.warning("correction history event could not be recorded")

    return {
        "finding_id": finding.id,
        "document_id": document.id,
        "version_id": finding.version_id,
        "version_number": version.version_number if version else document.current_version_number,
        "mode": mode,
        "provider": provider,
        "model": model,
        "provider_error": provider_error,
        "original_text": original_text,
        "original_is_exact_span": exact_span,
        "suggested_text": suggested_text,
        "rationale": rationale,
        "citations": citations,
        "cautions": cautions,
        "limitations": limitations,
        "evidence_status": finding.evidence_status,
        "location_label": finding.location_label,
        "source_reference": finding.source_reference,
        "available_rule_ids": [item.id for item in workspace_rules],
        "available_fact_ids": [item.id for item in workspace_facts],
    }