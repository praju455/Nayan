import asyncio

from fastapi.testclient import TestClient

from app.context.builder import MAX_PLANNER_ELEMENTS, build_reasoning_context
from app.main import app
from app.reasoning.backend import FallbackReasoningBackend, PLANNER_INSTRUCTIONS, PlannerUnavailableError, configured_backend, ensure_action_is_grounded, provider_backend
from app.schemas.models import ActionResponse, SanitizedContext

safe_payload = {"protocolVersion": "1.0", "taskId": "task_demo", "screen": {"width": 100, "height": 100}, "task": "Submit the form for <EMAIL_1_a1>.", "elements": [{"id": "submit", "role": "button", "label": "Submit reimbursement", "text": "Submit reimbursement", "bbox": [1, 2, 30, 20], "visible": True, "interactive": True, "confidence": 0.99, "source": ["dom"]}], "redactions": [{"type": "EMAIL", "token": "EMAIL_1_a1", "bbox": [1, 2, 30, 20], "method": "tokenize"}], "state": {"step": 0, "pageFingerprint": "abcdef"}, "redactedScreenshot": None}


def test_safe_context_returns_confirmation_action() -> None:
    response = TestClient(app).post("/v1/agent/next-action", json=safe_payload)
    assert response.status_code == 200
    assert response.json()["action"] == "confirm_needed"


def test_confirmed_context_can_return_validated_click() -> None:
    response = TestClient(app).post("/v1/agent/next-action", json={**safe_payload, "state": {"step": 1, "pageFingerprint": "abcdef", "confirmed": True}})
    assert response.status_code == 200
    assert response.json()["action"] == "click"
    assert response.json()["targetId"] == "submit"


def test_server_rejects_raw_artifact_and_plaintext_pii() -> None:
    raw_frame = {**safe_payload, "rawFrame": "forbidden"}
    raw_email = {**safe_payload, "task": "Send ava@example.com"}
    assert TestClient(app).post("/v1/agent/next-action", json=raw_frame).status_code == 422
    assert TestClient(app).post("/v1/agent/next-action", json=raw_email).status_code == 422


def test_planner_fills_an_empty_field_only_with_a_local_token() -> None:
    payload = {
        **safe_payload,
        "elements": [
            {"id": "profile_email", "role": "textbox", "label": "Profile email", "text": "<EMAIL_1_a1>", "bbox": [1, 1, 20, 10], "visible": True, "interactive": True, "confidence": 0.99, "source": ["dom"]},
            {"id": "form_email", "role": "textbox", "label": "Email", "text": None, "bbox": [1, 12, 20, 22], "visible": True, "interactive": True, "confidence": 0.99, "source": ["dom"]},
            {"id": "submit", "role": "button", "label": "Submit reimbursement", "text": "Submit reimbursement", "bbox": [1, 24, 20, 34], "visible": True, "interactive": True, "confidence": 0.99, "source": ["dom"]},
        ],
    }
    response = TestClient(app).post("/v1/agent/next-action", json=payload)
    assert response.status_code == 200
    assert response.json()["action"] == "type"
    assert response.json()["targetId"] == "form_email"
    assert response.json()["valueToken"] == "EMAIL_1_a1"


def test_planner_drafts_locally_tokenized_message_without_send_action() -> None:
    payload = {
        **safe_payload,
        "task": "Draft the private message in the visible chat composer. Private draft text: <USER_PROVIDED_TEXT_1_a1>.",
        "elements": [
            {"id": "composer", "role": "textbox", "semanticType": "contenteditable", "label": "Message", "text": None, "bbox": [1, 1, 20, 10], "visible": True, "interactive": True, "confidence": 0.99, "source": ["aria"]},
            {"id": "send", "role": "button", "label": "Send", "text": "Send", "bbox": [1, 12, 20, 22], "visible": True, "interactive": True, "confidence": 0.99, "source": ["dom"]},
        ],
    }
    response = TestClient(app).post("/v1/agent/next-action", json=payload)
    assert response.status_code == 200
    assert response.json()["action"] == "type"
    assert response.json()["targetId"] == "composer"
    assert response.json()["valueToken"] == "USER_PROVIDED_TEXT_1_a1"


def test_planner_stops_after_one_private_draft_action() -> None:
    payload = {
        **safe_payload,
        "task": "Draft the private message. Private draft text: <USER_PROVIDED_TEXT_1_a1>.",
        "state": {"step": 1, "pageFingerprint": "abcdef"},
        "elements": [
            {"id": "composer", "role": "textbox", "semanticType": "contenteditable", "label": "Message", "text": None, "bbox": [1, 1, 20, 10], "visible": True, "interactive": True, "confidence": 0.99, "source": ["aria"]},
        ],
    }
    response = TestClient(app).post("/v1/agent/next-action", json=payload)
    assert response.status_code == 200
    assert response.json()["action"] == "done"


def test_planner_clicks_send_only_after_message_confirmation() -> None:
    payload = {
        **safe_payload,
        "task": "Send the drafted message. Private draft text: <USER_PROVIDED_TEXT_1_a1>.",
        "state": {"step": 1, "pageFingerprint": "abcdef", "confirmed": True},
        "elements": [
            {"id": "composer", "role": "textbox", "semanticType": "contenteditable", "label": "Message", "text": "<USER_PROVIDED_TEXT_1_a1>", "bbox": [1, 1, 20, 10], "visible": True, "interactive": True, "confidence": 0.99, "source": ["aria"]},
            {"id": "send", "role": "button", "label": "Send", "text": "Send", "bbox": [1, 12, 20, 22], "visible": True, "interactive": True, "confidence": 0.99, "source": ["dom"]},
        ],
    }
    response = TestClient(app).post("/v1/agent/next-action", json=payload)
    assert response.status_code == 200
    assert response.json()["action"] == "click"
    assert response.json()["targetId"] == "send"


def test_planner_searches_then_selects_a_private_recipient_locally() -> None:
    start = {
        **safe_payload,
        "task": "Send a message after confirmation.\nPrivate chat recipient: <USER_SELECTED_RECIPIENT_1_a1>.",
        "elements": [
            {"id": "search", "role": "textbox", "semanticType": "search", "label": "Search", "text": None, "bbox": [1, 1, 20, 10], "visible": True, "interactive": True, "confidence": 0.99, "source": ["dom"]},
        ],
    }
    first = TestClient(app).post("/v1/agent/next-action", json=start)
    assert first.status_code == 200
    assert first.json()["action"] == "type"
    assert first.json()["targetId"] == "search"
    assert first.json()["valueToken"] == "USER_SELECTED_RECIPIENT_1_a1"
    second = TestClient(app).post("/v1/agent/next-action", json={**start, "state": {"step": 1, "pageFingerprint": "abcdef"}})
    assert second.status_code == 200
    assert second.json()["action"] == "click_visible_text"
    assert second.json()["valueToken"] == "USER_SELECTED_RECIPIENT_1_a1"


def test_unknown_hosted_provider_is_not_constructed() -> None:
    assert provider_backend("not-a-provider") is None


def test_gemini_is_primary_with_groq_as_the_backup(monkeypatch) -> None:
    monkeypatch.delenv("NAYAN_REASONING_BACKENDS", raising=False)
    monkeypatch.setenv("GEMINI_API_KEY", "test-gemini-key")
    monkeypatch.setenv("GROQ_API_KEY", "test-groq-key")
    backend = configured_backend()
    assert isinstance(backend, FallbackReasoningBackend)
    assert [candidate.model for candidate in backend.backends[:2]] == ["gemini-3.7-flash", "qwen/qwen3.6-27b"]
    assert backend.backends[0].timeout_seconds == 12
    assert backend.backends[-1].__class__.__name__ == "SafeRuleReasoningBackend"


def test_hosted_planner_contract_requires_nayan_field_names() -> None:
    assert "targetId" in PLANNER_INSTRUCTIONS
    assert "never `target`" in PLANNER_INSTRUCTIONS


def test_model_cannot_invent_a_local_token() -> None:
    scene = SanitizedContext.model_validate({
        **safe_payload,
        "task": "Type <USER_PROVIDED_TEXT_1_known>.",
    })
    action = {"action": "type", "targetId": "submit", "valueToken": "USER_PROVIDED_TEXT_9_invented", "confidence": 0.9, "reason": "test"}
    try:
        ensure_action_is_grounded(ActionResponse.model_validate(action), scene)
    except PlannerUnavailableError:
        return
    raise AssertionError("Invented local tokens must be rejected")


def test_premature_hosted_done_recovers_to_the_local_draft_step() -> None:
    class DoneBackend:
        async def next_action(self, scene, reasoning_context):
            return ActionResponse.model_validate({"action": "done", "confidence": 0.9, "reason": "incorrect early stop"})

    scene = SanitizedContext.model_validate({
        **safe_payload,
        "task": "Type <USER_PROVIDED_TEXT_1_known>.",
        "elements": [{"id": "composer", "role": "textbox", "semanticType": "contenteditable", "label": "Message", "text": None, "bbox": [1, 1, 20, 10], "visible": True, "interactive": True, "confidence": 0.99, "source": ["aria"]}],
    })
    action = asyncio.run(FallbackReasoningBackend([DoneBackend()]).next_action(scene, "safe context"))
    assert action.action == "type"
    assert action.targetId == "composer"
    assert action.valueToken == "USER_PROVIDED_TEXT_1_known"


def test_planner_context_is_bounded_to_visible_controls() -> None:
    payload = {
        **safe_payload,
        "elements": [
            {"id": f"element_{index}", "role": "button", "label": f"Button {index}", "text": "x" * 400, "bbox": [1, 1, 20, 10], "visible": True, "interactive": True, "confidence": 0.99, "source": ["dom"]}
            for index in range(MAX_PLANNER_ELEMENTS + 20)
        ],
    }
    context = build_reasoning_context(SanitizedContext.model_validate(payload))
    assert context.count(": button;") == MAX_PLANNER_ELEMENTS
    assert "x" * 161 not in context
