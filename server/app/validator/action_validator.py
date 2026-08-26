from fastapi import HTTPException, status

from app.schemas.models import ActionResponse, SanitizedContext


def validate_server_action(action: ActionResponse, context: SanitizedContext) -> ActionResponse:
    element_ids = {element.id for element in context.elements}
    if action.targetId and action.targetId not in element_ids:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Planner returned unknown target")
    if action.action == "click" and action.targetId:
        target = next(element for element in context.elements if element.id == action.targetId)
        if not target.interactive or not target.visible:
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Planner targeted an unsafe element")
    return action
