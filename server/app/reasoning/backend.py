from typing import Protocol

from app.schemas.models import ActionResponse, SanitizedContext


class ReasoningBackend(Protocol):
    async def next_action(self, scene: SanitizedContext, reasoning_context: str) -> ActionResponse: ...


class SafeRuleReasoningBackend:
    """Deterministic demo planner; it reasons only over an already-sanitized scene."""

    async def next_action(self, scene: SanitizedContext, reasoning_context: str) -> ActionResponse:
        task = scene.task.lower()
        submit = next((element for element in scene.elements if element.interactive and any(word in " ".join(filter(None, [element.label, element.text])).lower() for word in ("submit", "send", "confirm"))), None)
        if submit and any(word in task for word in ("submit", "complete", "send")):
            if scene.state.confirmed:
                return ActionResponse(action="click", targetId=submit.id, confidence=0.98, reason="The user locally confirmed form submission.")
            return ActionResponse(action="confirm_needed", confidence=0.98, reason="Submitting a form is high impact and requires local user confirmation.", message="Submit the completed form?")
        if scene.state.step > 8:
            return ActionResponse(action="done", confidence=0.9, reason="No further safe action is needed.")
        first_control = next((element for element in scene.elements if element.interactive and element.role in {"textbox", "combobox"}), None)
        if first_control:
            return ActionResponse(action="focus", targetId=first_control.id, confidence=0.72, reason="Focusing the next visible form control is a safe non-destructive step.")
        return ActionResponse(action="done", confidence=0.75, reason="No safe grounded action was found.")
