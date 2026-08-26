import { describe, expect, it } from "vitest";
import { alignNodesToCapture } from "../src/capture/coordinates";
import type { RawSemanticNode } from "../src/shared/types";

const node: RawSemanticNode = { id: "field", tag: "input", role: "textbox", bbox: [10, 20, 110, 60], visible: true, interactive: true, disabled: false, source: ["dom"] };

describe("capture coordinate alignment", () => {
  it("maps CSS-pixel DOM boxes to device-pixel screenshots", () => {
    expect(alignNodesToCapture([node], { width: 1280, height: 720 }, { width: 2560, height: 1440 })[0]?.bbox).toEqual([20, 40, 220, 120]);
  });
});
