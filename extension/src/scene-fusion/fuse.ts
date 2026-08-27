import type { RawSemanticNode, SanitizedElement, VisualElement } from "../shared/types";

function overlap(a: readonly number[], b: readonly number[]): number { const left = Math.max(a[0]!, b[0]!); const top = Math.max(a[1]!, b[1]!); const right = Math.min(a[2]!, b[2]!); const bottom = Math.min(a[3]!, b[3]!); const intersection = Math.max(0, right - left) * Math.max(0, bottom - top); const union = (a[2]! - a[0]!) * (a[3]! - a[1]!) + (b[2]! - b[0]!) * (b[3]! - b[1]!) - intersection; return union ? intersection / union : 0; }

export function fuseSemanticAndVisual(nodes: readonly RawSemanticNode[], sanitized: readonly SanitizedElement[], visual: readonly VisualElement[]): SanitizedElement[] {
  const fused = sanitized.map((element, index) => {
    const sourceNode = nodes[index]; const matched = visual.find((detection) => detection.id === element.id || overlap(element.bbox, detection.bbox) > 0.5);
    return matched ? { ...element, semanticType: matched.type === "unknown" ? element.semanticType : matched.type, bbox: sourceNode?.bbox ?? matched.bbox, confidence: Math.max(element.confidence, matched.confidence), source: [...element.source, "vision"] as const } : element;
  });
  // Pixel-only regions give the planner layout awareness but cannot be clicked:
  // every executable target must originate from a live DOM/ARIA element.
  const visualOnly = visual.filter((detection) => !sanitized.some((element) => overlap(element.bbox, detection.bbox) > 0.5)).map((detection) => ({ id: detection.id, role: "visual_region", semanticType: detection.type, bbox: detection.bbox, visible: true, interactive: false, confidence: detection.confidence, source: ["vision"] as const }));
  return [...fused, ...visualOnly];
}
