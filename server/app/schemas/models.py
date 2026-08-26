from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class Screen(StrictModel):
    width: int = Field(gt=0)
    height: int = Field(gt=0)


class SanitizedElement(StrictModel):
    id: str = Field(min_length=1, max_length=128)
    role: str = Field(min_length=1, max_length=64)
    semanticType: str | None = Field(default=None, max_length=64)
    label: str | None = Field(default=None, max_length=300)
    text: str | None = Field(default=None, max_length=1000)
    bbox: tuple[float, float, float, float]
    visible: bool
    interactive: bool
    confidence: float = Field(ge=0, le=1)
    source: list[Literal["dom", "aria", "vision", "ocr"]] = Field(min_length=1)


class SanitizedTab(StrictModel):
    id: int = Field(ge=0)
    origin: str = Field(pattern=r"^https?://")
    title: str | None = Field(default=None, max_length=300)
    active: bool


class Redaction(StrictModel):
    type: str
    token: str | None = None
    bbox: tuple[float, float, float, float]
    method: Literal["black", "blur", "pixelate", "tokenize"]


class AgentState(StrictModel):
    step: int = Field(ge=0)
    pageFingerprint: str = Field(min_length=1, max_length=128)
    confirmed: bool = False


class SanitizedContext(StrictModel):
    protocolVersion: Literal["1.0"]
    taskId: str = Field(pattern=r"^task_[A-Za-z0-9_-]+$")
    screen: Screen
    task: str = Field(max_length=4000)
    tabs: list[SanitizedTab] = Field(default_factory=list, max_length=100)
    elements: list[SanitizedElement] = Field(max_length=500)
    redactions: list[Redaction]
    state: AgentState
    redactedScreenshot: str | None = Field(default=None, max_length=4_000_000)


ActionName = Literal["click", "type", "scroll", "select", "click_visible_text", "activate_tab", "focus", "navigate", "wait", "done", "confirm_needed"]


class ActionResponse(StrictModel):
    action: ActionName
    targetId: str | None = Field(default=None, max_length=128)
    tabId: int | None = Field(default=None, ge=0)
    valueToken: str | None = Field(default=None, pattern=r"^[A-Z_]+_[A-Za-z0-9_-]+$")
    destination: HttpUrl | None = None
    deltaY: float | None = Field(default=None, ge=-5000, le=5000)
    message: str | None = Field(default=None, max_length=500)
    confidence: float = Field(ge=0, le=1)
    reason: str = Field(min_length=1, max_length=500)

    @model_validator(mode="after")
    def action_shape_is_safe(self) -> "ActionResponse":
        if self.action in {"click", "type", "select", "focus"} and not self.targetId:
            raise ValueError("targetId is required for target actions")
        if self.action in {"type", "select", "click_visible_text"} and not self.valueToken:
            raise ValueError("field-changing actions require a placeholder token")
        if self.action == "navigate" and not self.destination:
            raise ValueError("navigate action requires destination")
        if self.action == "activate_tab" and self.tabId is None:
            raise ValueError("activate_tab action requires tabId")
        return self
