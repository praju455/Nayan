import type { BoundingBox } from "../shared/types";

export type PixelFrame = Readonly<{ data: Uint8ClampedArray; width: number; height: number }>;
export type VisualProposal = Readonly<{ bbox: BoundingBox; confidence: number }>;

const clamp = (value: number, minimum: number, maximum: number): number => Math.max(minimum, Math.min(maximum, value));

/**
 * Finds visually distinct screen regions directly from pixels. This is a
 * lightweight local proposal stage inspired by screen-parsing pipelines: it
 * has no DOM input, no network path, and only supplies non-interactive
 * candidates for the local ONNX classifier.
 */
export function proposeVisualRegions(frame: PixelFrame, maximum = 12): VisualProposal[] {
  const cell = clamp(Math.round(Math.min(frame.width, frame.height) / 45), 12, 28);
  const columns = Math.ceil(frame.width / cell); const rows = Math.ceil(frame.height / cell);
  const energy = new Float32Array(columns * rows);
  const luminance = (x: number, y: number): number => {
    const boundedX = clamp(x, 0, frame.width - 1); const boundedY = clamp(y, 0, frame.height - 1);
    const offset = (boundedY * frame.width + boundedX) * 4;
    return frame.data[offset]! * 0.2126 + frame.data[offset + 1]! * 0.7152 + frame.data[offset + 2]! * 0.0722;
  };
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    const left = column * cell; const top = row * cell;
    let sum = 0; let samples = 0;
    for (let y = top + 2; y < Math.min(frame.height - 1, top + cell); y += 4) for (let x = left + 2; x < Math.min(frame.width - 1, left + cell); x += 4) {
      sum += Math.abs(luminance(x + 1, y) - luminance(x - 1, y)) + Math.abs(luminance(x, y + 1) - luminance(x, y - 1));
      samples++;
    }
    energy[row * columns + column] = samples ? sum / samples : 0;
  }
  const active = new Uint8Array(energy.length);
  // A conservative threshold avoids turning ordinary background into visual
  // elements. Each component must also span more than one screen cell.
  for (let index = 0; index < energy.length; index++) active[index] = energy[index]! >= 30 ? 1 : 0;
  const proposals: VisualProposal[] = [];
  for (let start = 0; start < active.length; start++) {
    if (!active[start]) continue;
    const pending = [start]; active[start] = 0;
    let minColumn = columns; let maxColumn = 0; let minRow = rows; let maxRow = 0; let totalEnergy = 0; let count = 0;
    while (pending.length) {
      const current = pending.pop()!; const row = Math.floor(current / columns); const column = current % columns;
      minColumn = Math.min(minColumn, column); maxColumn = Math.max(maxColumn, column); minRow = Math.min(minRow, row); maxRow = Math.max(maxRow, row);
      totalEnergy += energy[current]!; count++;
      const neighbours: readonly (readonly [number, number])[] = [[column - 1, row], [column + 1, row], [column, row - 1], [column, row + 1]];
      for (const [nextColumn, nextRow] of neighbours) {
        if (nextColumn < 0 || nextColumn >= columns || nextRow < 0 || nextRow >= rows) continue;
        const next = nextRow * columns + nextColumn;
        if (active[next]) { active[next] = 0; pending.push(next); }
      }
    }
    const left = minColumn * cell; const top = minRow * cell; const right = Math.min(frame.width, (maxColumn + 1) * cell); const bottom = Math.min(frame.height, (maxRow + 1) * cell);
    const area = (right - left) * (bottom - top);
    if (count < 2 || area < cell * cell * 2 || right - left < 32 || bottom - top < 20) continue;
    proposals.push({ bbox: [left, top, right, bottom], confidence: Math.min(0.9, 0.35 + totalEnergy / Math.max(1, count) / 180) });
  }
  return proposals.sort((left, right) => right.confidence - left.confidence).slice(0, maximum);
}
