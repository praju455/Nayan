import type { LocalRawFrame } from "../shared/types";
import { browser } from "wxt/browser";

/** Captures pixels only for the local perception pipeline. Never call from transport code. */
export async function captureLocalFrame(windowId?: number): Promise<LocalRawFrame> {
  const dataUrl = windowId === undefined ? await browser.tabs.captureVisibleTab({ format: "png" }) : await browser.tabs.captureVisibleTab(windowId, { format: "png" });
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("Local frame canvas unavailable");
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  const frame = context.getImageData(0, 0, canvas.width, canvas.height);
  return { image: frame, width: frame.width, height: frame.height, createdAt: Date.now() } as LocalRawFrame;
}
