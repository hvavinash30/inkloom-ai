from fastapi import APIRouter
from app.api.v1.endpoints import (
    approved_facts,
    assistant,
    audits,
    brand_assets,
    brand_memory,
    brand_rules,
    campaigns,
    dashboard,
    evaluation,
    health,
    history,
    insights,
    organization,
    research,
    reviews,
    session,
    uploads,
)

api_router = APIRouter()

api_router.include_router(health.router, prefix="", tags=["System"])
api_router.include_router(session.router, prefix="", tags=["Session"])
api_router.include_router(dashboard.router, prefix="/dashboard", tags=["Dashboard"])
api_router.include_router(audits.router, prefix="/audits", tags=["Content & Audits"])
api_router.include_router(reviews.router, prefix="/reviews", tags=["Review Workflow"])
api_router.include_router(history.router, prefix="/history", tags=["Audit History"])
api_router.include_router(campaigns.router, prefix="/campaigns", tags=["Campaigns"])
api_router.include_router(brand_rules.router, prefix="/brand-rules", tags=["Brand Rules"])
api_router.include_router(approved_facts.router, prefix="/approved-facts", tags=["Approved Facts"])
api_router.include_router(brand_assets.router, prefix="/brand-assets", tags=["Brand Assets"])
api_router.include_router(brand_memory.router, prefix="/brand-memory", tags=["Brand Memory"])
api_router.include_router(insights.router, prefix="/insights", tags=["Governance Insights"])
api_router.include_router(research.router, prefix="/research", tags=["Research & Validation"])
api_router.include_router(evaluation.router, prefix="/evaluation", tags=["Evaluation"])
api_router.include_router(organization.router, prefix="/organization", tags=["Organization"])
api_router.include_router(uploads.router, prefix="/uploads", tags=["Uploads"])
api_router.include_router(assistant.router, prefix="/assistant", tags=["Assistant"])
