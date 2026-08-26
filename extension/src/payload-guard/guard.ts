import { recognizePii } from "../pii/recognizer";
import type { SanitizedContextPackage } from "../shared/types";

const forbiddenKeys = new Set(["rawscreenshot", "rawframe", "rawdom", "rawhtml", "rawocr", "rawtext", "password", "rawsecret", "unredactedframe", "plaintexttokenvalue", "tokenvault", "localsecretmap", "imagedata"]);
const tokenPattern = /<(?:[A-Z_]+)_[A-Za-z0-9_-]+>|<PASSWORD_FIELD>/g;

export class PrivacyBoundaryError extends Error { constructor(message: string) { super(message); this.name = "PrivacyBoundaryError"; } }

function inspect(value: unknown, path = "$"): void {
  if (typeof value === "string") {
    const withoutTokens = value.replace(tokenPattern, "");
    if (recognizePii(withoutTokens).length) throw new PrivacyBoundaryError(`PII detected in safe payload at ${path}`);
    return;
  }
  if (Array.isArray(value)) { value.forEach((item, index) => inspect(item, `${path}[${index}]`)); return; }
  if (value && typeof value === "object") for (const [key, nested] of Object.entries(value)) { if (forbiddenKeys.has(key.toLowerCase())) throw new PrivacyBoundaryError(`Forbidden artifact key: ${key}`); inspect(nested, `${path}.${key}`); }
}

export function assertSafePayload(payload: SanitizedContextPackage): SanitizedContextPackage {
  if (payload.protocolVersion !== "1.0" || !payload.taskId.startsWith("task_")) throw new PrivacyBoundaryError("Invalid sanitized context envelope");
  if (payload.redactedScreenshot && !payload.redactions.length) throw new PrivacyBoundaryError("Redacted screenshot has no redaction metadata");
  inspect(payload);
  return Object.freeze(payload);
}
