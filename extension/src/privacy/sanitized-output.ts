import { redactImageLocally } from "./sanitizer";
import type { LocalRawFrame, RedactionRecord, SanitizedContextPackage, SanitizedElement } from "../shared/types";

export type LocalSanitizedArtifact = Readonly<{ context: SanitizedContextPackage; redactedPixels: ImageData; rawPreview: ImageData }>;

/**
 * Creates a brand-new safe artifact from local raw pixels. The raw frame remains in this module's
 * local return value and is never part of `context`, which is the only value eligible for transport.
 */
export function createSanitizedOutput(input: { rawFrame: LocalRawFrame; taskId: string; task: string; elements: readonly SanitizedElement[]; redactions: readonly RedactionRecord[]; step: number; pageFingerprint: string; confirmed: boolean }): LocalSanitizedArtifact {
  const redactedPixels = redactImageLocally(input.rawFrame.image, input.redactions);
  verifyRedactions(redactedPixels, input.redactions);
  const context: SanitizedContextPackage = { protocolVersion: "1.0", taskId: input.taskId, screen: { width: input.rawFrame.width, height: input.rawFrame.height }, task: input.task, elements: input.elements, redactions: input.redactions, state: { step: input.step, pageFingerprint: input.pageFingerprint, confirmed: input.confirmed }, redactedScreenshot: null };
  return { context, redactedPixels, rawPreview: input.rawFrame.image };
}

/** A downscaled redacted image for the extension UI only; never part of transport. */
export async function localPreviewDataUrl(redactedPixels: ImageData): Promise<string> {
  const maxWidth = 720;
  const scale = Math.min(1, maxWidth / redactedPixels.width);
  const width = Math.max(1, Math.round(redactedPixels.width * scale));
  const height = Math.max(1, Math.round(redactedPixels.height * scale));
  const source = new OffscreenCanvas(redactedPixels.width, redactedPixels.height);
  const sourceContext = source.getContext("2d");
  const preview = new OffscreenCanvas(width, height);
  const previewContext = preview.getContext("2d");
  if (!sourceContext || !previewContext) throw new Error("Local preview canvas unavailable");
  sourceContext.putImageData(redactedPixels, 0, 0);
  previewContext.drawImage(source, 0, 0, width, height);
  const bytes = new Uint8Array(await (await preview.convertToBlob({ type: "image/jpeg", quality: 0.78 })).arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return `data:image/jpeg;base64,${btoa(binary)}`;
}

/** Ensure sensitive rectangles were physically replaced before any optional image serialization. */
export function verifyRedactions(image: ImageData, redactions: readonly RedactionRecord[]): void {
  for (const redaction of redactions) {
    if (redaction.method === "tokenize" || redaction.method === "blur") continue;
    const [left, top, right, bottom] = redaction.bbox.map(Math.round) as [number, number, number, number];
    const x = Math.max(0, Math.min(image.width - 1, left)); const y = Math.max(0, Math.min(image.height - 1, top));
    const pixel = (y * image.width + x) * 4;
    if (image.data[pixel] !== 0 || image.data[pixel + 1] !== 0 || image.data[pixel + 2] !== 0) throw new Error(`Local redaction verification failed for ${redaction.type}`);
  }
}
