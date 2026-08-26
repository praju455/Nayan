import { describe, expect, it } from "vitest";
import { confirmationForAction } from "../src/policy/action-policy";
import type { AgentAction, SanitizedElement } from "../src/shared/types";

const element = (label: string): SanitizedElement => ({ id: "target", role: "button", label, bbox: [0, 0, 10, 10], visible: true, interactive: true, confidence: 1, source: ["dom"] });
const click: AgentAction = { action: "click", targetId: "target", confidence: 0.9, reason: "planner choice" };

describe("central action policy", () => {
  it("requires confirmation for high-impact clicks independent of the planner", () => expect(confirmationForAction(click, [element("Send message")])?.message).toContain("Send message"));
  it("allows ordinary reversible clicks", () => expect(confirmationForAction(click, [element("Open menu")])).toBeUndefined());
});
