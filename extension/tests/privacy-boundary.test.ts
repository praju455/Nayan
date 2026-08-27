import { describe, expect, it } from "vitest";
import { PrivacyBoundaryError, assertSafePayload } from "../src/payload-guard/guard";
import { recognizePii } from "../src/pii/recognizer";
import { sanitizeTask } from "../src/privacy/sanitizer";
import type { SanitizedContextPackage } from "../src/shared/types";
import { TokenVault } from "../src/token-vault/token-vault";

const safePayload: SanitizedContextPackage = {
  protocolVersion: "1.0", taskId: "task_demo", screen: { width: 1280, height: 720 }, task: "Enter <EMAIL_1_x7> in the email field.",
  elements: [{ id: "e1", role: "textbox", semanticType: "email", text: "<EMAIL_1_x7>", bbox: [10, 10, 100, 30], visible: true, interactive: true, confidence: 0.99, source: ["dom"] }],
  redactions: [{ type: "EMAIL", token: "EMAIL_1_x7", bbox: [10, 10, 100, 30], method: "tokenize" }], state: { step: 0, pageFingerprint: "fp_aabbccddeeffgghh" }, redactedScreenshot: null
};

describe("privacy boundary", () => {
  it("allows a separately sanitized context package", () => expect(assertSafePayload(safePayload)).toBe(safePayload));
  it("blocks raw PII in otherwise innocent values", () => expect(() => assertSafePayload({ ...safePayload, task: "Send ava@example.com" })).toThrow(PrivacyBoundaryError));
  it("blocks raw-artifact keys before a network request can be made", () => expect(() => assertSafePayload({ ...safePayload, rawFrame: "base64-data" } as unknown as SanitizedContextPackage)).toThrow("Forbidden artifact key"));
  it("recognizes validated structured PII and rejects invalid card-like values", () => { expect(recognizePii("Mail ava@example.com, card 4111 1111 1111 1111").map((match) => match.category)).toEqual(expect.arrayContaining(["EMAIL", "CREDIT_CARD"])); expect(recognizePii("1234 5678 9012 3456").some((match) => match.category === "CREDIT_CARD")).toBe(false); });
  it("keeps exact recipient and draft text in the local vault even when they are not conventional PII", () => { const vault = new TokenVault(); const task = sanitizeTask("Draft a message but do not send it.", vault, "hello from Nayan", "Diya"); expect(task).toContain("<USER_PROVIDED_TEXT_"); expect(task).toContain("<USER_SELECTED_RECIPIENT_"); expect(task).not.toContain("hello from Nayan"); expect(task).not.toContain("Diya"); });
});
