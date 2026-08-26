import type { RawSemanticNode } from "../shared/types";

export type Viewport = Readonly<{ width: number; height: number }>;

/** Converts DOM/CSS-pixel boxes to the captured screenshot's pixel space. */
export function alignNodesToCapture(nodes: readonly RawSemanticNode[], viewport: Viewport, capture: Readonly<{ width: number; height: number }>): RawSemanticNode[] {
  const xScale = capture.width / viewport.width;
  const yScale = capture.height / viewport.height;
  return nodes.map((node) => ({ ...node, bbox: [node.bbox[0] * xScale, node.bbox[1] * yScale, node.bbox[2] * xScale, node.bbox[3] * yScale] as const }));
}
