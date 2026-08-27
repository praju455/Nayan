import asyncio
import json

import httpx

from app.reasoning.backend import FallbackReasoningBackend, GeminiReasoningBackend, GroqReasoningBackend
from app.schemas.models import SanitizedContext


SCENE = SanitizedContext.model_validate({
    "protocolVersion": "1.0", "taskId": "task_cloud", "screen": {"width": 100, "height": 100}, "task": "Click <EMAIL_1_token> safely.",
    "elements": [{"id": "continue", "role": "button", "label": "Continue", "bbox": [1, 2, 30, 20], "visible": True, "interactive": True, "confidence": 0.9, "source": ["vision"]}],
    "redactions": [{"type": "EMAIL", "token": "EMAIL_1_token", "bbox": [1, 2, 30, 20], "method": "tokenize"}], "state": {"step": 0, "pageFingerprint": "fp_safe"},
})
CONTEXT = "USER GOAL: Click <EMAIL_1_token> safely.\nELEMENTS:\ncontinue: button; generic; Continue"


def test_gemini_receives_only_sanitized_context_and_parses_action() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert "raw@example.com" not in request.content.decode()
        assert "<EMAIL_1_token>" in request.content.decode()
        return httpx.Response(200, json={"candidates": [{"content": {"parts": [{"text": json.dumps({"action": "click", "targetId": "continue", "confidence": 0.9, "reason": "Grounded."})}]}}]})

    backend = GeminiReasoningBackend("test-key", "test-model", httpx.MockTransport(handler))
    action = asyncio.run(backend.next_action(SCENE, CONTEXT))
    assert action.action == "click"
    assert action.targetId == "continue"


def test_groq_is_used_only_when_gemini_fails_closed() -> None:
    gemini = GeminiReasoningBackend("test-key", "test-model", httpx.MockTransport(lambda request: httpx.Response(503)))

    def groq_handler(request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.content)
        assert payload["response_format"] == {"type": "json_object"}
        return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps({"action": "done", "confidence": 0.9, "reason": "No action needed."})}}]})

    backend = FallbackReasoningBackend([gemini, GroqReasoningBackend("test-key", "test-model", httpx.MockTransport(groq_handler))])
    assert asyncio.run(backend.next_action(SCENE, CONTEXT)).action == "done"
