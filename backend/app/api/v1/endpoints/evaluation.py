from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.security import Actor, require_caps
from app.db.session import get_db
from app.models.assets import EvaluationCase, EvaluationRun
from app.schemas.assets import EvaluationSummaryOut
from app.services import evaluation_service

router = APIRouter()


@router.get("/", response_model=EvaluationSummaryOut)
def evaluation_summary(
    actor: Actor = Depends(require_caps("evaluation.run")),
    db: Session = Depends(get_db),
):
    return evaluation_service.build_summary(db, actor.workspace_id)


@router.post("/run-all", response_model=EvaluationSummaryOut)
def run_all(
    actor: Actor = Depends(require_caps("evaluation.run")),
    db: Session = Depends(get_db),
):
    evaluation_service.run_all_cases(db, actor.workspace_id)
    return evaluation_service.build_summary(db, actor.workspace_id)


@router.post("/cases/{case_id}/run", response_model=EvaluationSummaryOut)
def run_single_case(
    case_id: str,
    actor: Actor = Depends(require_caps("evaluation.run")),
    db: Session = Depends(get_db),
):
    case = (
        db.query(EvaluationCase)
        .filter(
            EvaluationCase.id == case_id,
            EvaluationCase.workspace_id == actor.workspace_id,
        )
        .first()
    )
    if not case:
        raise HTTPException(status_code=404, detail="Evaluation case not found.")
    evaluation_service.run_case(db, case)
    return evaluation_service.build_summary(db, actor.workspace_id)


@router.get("/runs")
def list_runs(
    actor: Actor = Depends(require_caps("evaluation.run")),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(EvaluationRun, EvaluationCase.name)
        .join(EvaluationCase, EvaluationCase.id == EvaluationRun.case_id)
        .filter(EvaluationCase.workspace_id == actor.workspace_id)
        .order_by(EvaluationRun.executed_at.desc())
        .limit(100)
        .all()
    )
    return [
        evaluation_service.serialize_run(run, case_name)
        for run, case_name in rows
    ]
