import { browser } from "wxt/browser";
import type { BoundingBox } from "../shared/types";

export type OcrText = Readonly<{ text: string; bbox: BoundingBox; confidence: number }>;

let worker: import("tesseract.js").Worker | undefined;

async function getWorker(): Promise<import("tesseract.js").Worker> {
  if (worker) return worker;
  const { createWorker } = await import("tesseract.js");
  const path = (file: string) => (browser.runtime as unknown as { getURL(input: string): string }).getURL(file);
  worker = await createWorker("eng", 1, { workerPath: path("ocr/worker.min.js"), corePath: path("ocr"), langPath: path("ocr"), workerBlobURL: false, cacheMethod: "none" });
  return worker;
}

/** Runs only against visible canvas regions without usable DOM text. It never makes a network request. */
export async function recognizeSelectiveCanvasText(): Promise<OcrText[]> {
  const canvases = [...document.querySelectorAll<HTMLCanvasElement>("canvas")].filter((canvas) => { const style = getComputedStyle(canvas); const box = canvas.getBoundingClientRect(); return style.display !== "none" && style.visibility !== "hidden" && box.width > 8 && box.height > 8 && !canvas.getAttribute("aria-label"); });
  if (!canvases.length) return [];
  try {
    const localWorker = await getWorker();
    const results = await Promise.all(canvases.slice(0, 4).map(async (canvas) => { const box = canvas.getBoundingClientRect(); const response = await localWorker.recognize(canvas, {}, { text: true, blocks: true }); const words = response.data.blocks?.flatMap((block) => block.paragraphs.flatMap((paragraph) => paragraph.lines.flatMap((line) => line.words))) ?? []; return words.filter((word) => word.text.trim()).map((word) => ({ text: word.text, bbox: [box.left + word.bbox.x0, box.top + word.bbox.y0, box.left + word.bbox.x1, box.top + word.bbox.y1] as BoundingBox, confidence: word.confidence / 100 })); }));
    return results.flat();
  } catch { return []; }
}
