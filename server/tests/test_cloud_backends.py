import asyncio
import json

import httpx
import pytest

from app.reasoning.backend import OllamaReasoningBackend, GroqReasoningBackend, configured_backend
from app.schemas.models import SanitizedContext


SCENE = SanitizedContext.model_validate({
    "protocolVersion": "1.0", "taskId": "task_cloud", "screen": {"width": 100, "height": 100}, "task": "Click <EMAIL_1_token> safely.",
    "elements": [{"id": "continue", "role": "button", "label": "Continue", "bbox": [1, 2, 30, 20], "visible": True, "interactive": True, "confidence": 0.9, "source": ["vision"]}],
    "redactions": [{"type": "EMAIL", "token": "EMAIL_1_token", "bbox": [1, 2, 30, 20], "method": "tokenize"}], "state": {"step": 0, "pageFingerprint": "fp_safe"},
})
CONTEXT = "USER GOAL: Click <EMAIL_1_token> safely.\nELEMENTS:\ncontinue: button; generic; Continue"


def test_groq_receives_only_sanitized_context_and_parses_action() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert "raw@example.com" not in request.content.decode()
        assert "<EMAIL_1_token>" in request.content.decode()
        payload = json.loads(request.content)
        assert payload["response_format"] == {"type": "json_object"}
        return httpx.Response(200, json={"choices": [{"message": {"content": json.dumps({"action": "click", "targetId": "continue", "confidence": 0.9, "reason": "Grounded."})}}]})

    backend = GroqReasoningBackend("test-key", "test-model", httpx.MockTransport(handler))
    action = asyncio.run(backend.next_action(SCENE, CONTEXT))
    assert action.action == "click"
    assert action.targetId == "continue"


def test_ollama_receives_only_sanitized_context_and_uses_json_schema() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url == httpx.URL("http://127.0.0.1:11434/api/chat")
        assert "raw@example.com" not in request.content.decode()
        assert "<EMAIL_1_token>" in request.content.decode()
        payload = json.loads(request.content)
        assert payload["stream"] is False
        assert payload["format"]["additionalProperties"] is False
        return httpx.Response(200, json={"message": {"content": json.dumps({"action": "done", "confidence": 0.9, "reason": "No action needed."})}})

    backend = OllamaReasoningBackend("http://127.0.0.1:11434", "test-model", httpx.MockTransport(handler))
    assert asyncio.run(backend.next_action(SCENE, CONTEXT)).action == "done"


def test_ollama_rejects_public_endpoint() -> None:
    with pytest.raises(ValueError, match="must not point to a public host"):
        OllamaReasoningBackend("https://8.8.8.8", "test-model")


def test_configured_backend_requires_explicit_supported_mode(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("NAYAN_REASONING_BACKEND", "gemini")
    with pytest.raises(RuntimeError, match="rule, groq, ollama"):
        configured_backend()
