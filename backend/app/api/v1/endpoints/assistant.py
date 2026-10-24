from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.security import Actor, require_caps
from app.db.session import get_db
from app.schemas.assistant import AssistantChatRequest, AssistantChatResponse
from app.services.assistant_service import answer_query

router = APIRouter()


@router.post("/chat", response_model=AssistantChatResponse)
def assistant_chat(
    payload: AssistantChatRequest,
    actor: Actor = Depends(require_caps("assistant.use")),
    db: Session = Depends(get_db),
):
    return answer_query(db, actor, payload)
