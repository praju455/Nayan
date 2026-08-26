from fastapi.testclient import TestClient

from app.main import app

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
