from fastapi import APIRouter

from app.context.builder import build_reasoning_context
from app.reasoning.backend import PlannerUnavailableError, configured_backend
from app.schemas.models import ActionResponse, SanitizedContext
from app.security.privacy_gate import enforce_privacy_boundary
from app.validator.action_validator import validate_server_action

router = APIRouter()


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "nayan-planner"}


@router.post("/v1/agent/next-action", response_model=ActionResponse)
async def next_action(context: SanitizedContext) -> ActionResponse:
    # Validate raw inbound JSON after strict parsing; never log request content.
    enforce_privacy_boundary(context.model_dump(mode="json"))
    try:
        action = await configured_backend().next_action(context, build_reasoning_context(context))
    except (PlannerUnavailableError, RuntimeError) as error:
        from fastapi import HTTPException, status
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Hosted planner is unavailable or not configured") from error
    return validate_server_action(action, context)
