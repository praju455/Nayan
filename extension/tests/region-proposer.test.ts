import { describe, expect, it } from "vitest";
import { proposeVisualRegions } from "../src/perception/region-proposer";

describe("pixel-only visual region proposals", () => {
  it("finds a high-contrast region without DOM input", () => {
    const width = 96; const height = 64; const data = new Uint8ClampedArray(width * height * 4).fill(20);
    for (let y = 18; y < 46; y++) for (let x = 24; x < 74; x++) {
      const offset = (y * width + x) * 4; data[offset] = 230; data[offset + 1] = 230; data[offset + 2] = 230; data[offset + 3] = 255;
    }
    const regions = proposeVisualRegions({ data, width, height });
    expect(regions.some((region) => region.bbox[0] <= 24 && region.bbox[2] >= 74 && region.bbox[1] <= 18 && region.bbox[3] >= 46)).toBe(true);
  });
});
