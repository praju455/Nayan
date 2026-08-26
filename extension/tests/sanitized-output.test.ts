import { describe, expect, it } from "vitest";
import { verifyRedactions } from "../src/privacy/sanitized-output";
import type { RedactionRecord } from "../src/shared/types";

describe("physical redaction verification", () => {
  const redaction: RedactionRecord = { type: "PASSWORD", token: null, bbox: [1, 1, 3, 3], method: "black" };
  it("accepts blacked sensitive pixels", () => { const image = { width: 4, height: 4, data: new Uint8ClampedArray(4 * 4 * 4) } as ImageData; verifyRedactions(image, [redaction]); });
  it("rejects a non-redacted sensitive pixel", () => { const image = { width: 4, height: 4, data: new Uint8ClampedArray(4 * 4 * 4) } as ImageData; image.data[(1 * 4 + 1) * 4] = 255; expect(() => verifyRedactions(image, [redaction])).toThrow("verification failed"); });
});
