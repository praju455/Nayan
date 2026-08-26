import type * as ort from "onnxruntime-web";
import { browser } from "wxt/browser";
import type { BoundingBox, RedactionRecord } from "../shared/types";

const width = 320; const height = 240;
type FaceBox = Readonly<{ bbox: BoundingBox; confidence: number }>;

/** Compact UltraFace RFB-320 detector. All pixels and face boxes stay inside the extension. */
export class OnnxFaceDetector {
  private session?: ort.InferenceSession; private runtime?: typeof ort;
  async detect(image: ImageData): Promise<FaceBox[]> {
    await this.load(); if (!this.session || !this.runtime) return [];
    const tensor = new this.runtime.Tensor("float32", this.preprocess(image), [1, 3, height, width]);
    const output = await this.session.run({ [this.session.inputNames[0]!]: tensor });
    const scores = output.scores?.data as Float32Array | undefined; const boxes = output.boxes?.data as Float32Array | undefined;
    if (!scores || !boxes) return [];
    const candidates: FaceBox[] = [];
    const priors = this.priors(); const scaleX = image.width / width; const scaleY = image.height / height;
    for (let index = 0; index < priors.length; index += 1) { const confidence = scores[index * 2 + 1]!; if (confidence < 0.78) continue; const prior = priors[index]!; const offset = index * 4; const centerX = prior[0] + boxes[offset]! * 0.1 * prior[2]; const centerY = prior[1] + boxes[offset + 1]! * 0.1 * prior[3]; const boxWidth = prior[2] * Math.exp(boxes[offset + 2]! * 0.2); const boxHeight = prior[3] * Math.exp(boxes[offset + 3]! * 0.2); candidates.push({ bbox: [Math.max(0, (centerX - boxWidth / 2) * width * scaleX), Math.max(0, (centerY - boxHeight / 2) * height * scaleY), Math.min(image.width, (centerX + boxWidth / 2) * width * scaleX), Math.min(image.height, (centerY + boxHeight / 2) * height * scaleY)], confidence }); }
    return candidates.sort((a, b) => b.confidence - a.confidence).filter((face, index, faces) => faces.slice(0, index).every((kept) => iou(face.bbox, kept.bbox) < 0.3));
  }
  async dispose(): Promise<void> { await this.session?.release(); this.session = undefined; this.runtime = undefined; }
  private async load(): Promise<void> { if (this.session) return; try { const runtimeUrl = (browser.runtime as unknown as { getURL(path: string): string }).getURL("ort/ort.wasm.min.mjs"); this.runtime = await import(/* @vite-ignore */ runtimeUrl) as typeof ort; const modelUrl = (browser.runtime as unknown as { getURL(path: string): string }).getURL("models/ultraface-rfb-320.onnx"); this.session = await this.runtime.InferenceSession.create(modelUrl, { executionProviders: ["wasm"] }); } catch { this.runtime = undefined; } }
  private preprocess(image: ImageData): Float32Array { const canvas = new OffscreenCanvas(width, height); const context = canvas.getContext("2d"); if (!context) throw new Error("Local face canvas unavailable"); const source = new OffscreenCanvas(image.width, image.height); const sourceContext = source.getContext("2d"); if (!sourceContext) throw new Error("Local face canvas unavailable"); sourceContext.putImageData(image, 0, 0); context.drawImage(source, 0, 0, width, height); const pixels = context.getImageData(0, 0, width, height).data; const tensor = new Float32Array(3 * width * height); for (let pixel = 0; pixel < width * height; pixel += 1) { tensor[pixel] = (pixels[pixel * 4]! - 127) / 128; tensor[width * height + pixel] = (pixels[pixel * 4 + 1]! - 127) / 128; tensor[2 * width * height + pixel] = (pixels[pixel * 4 + 2]! - 127) / 128; } return tensor; }
  private priors(): [number, number, number, number][] { const minBoxes = [[10, 16, 24], [32, 48], [64, 96], [128, 192, 256]]; const strides = [8, 16, 32, 64]; const priors: [number, number, number, number][] = []; for (let level = 0; level < strides.length; level += 1) { const stride = strides[level]!; for (let y = 0; y < Math.ceil(height / stride); y += 1) for (let x = 0; x < Math.ceil(width / stride); x += 1) for (const size of minBoxes[level]!) priors.push([(x + 0.5) * stride / width, (y + 0.5) * stride / height, size / width, size / height]); } return priors; }
}

function iou(a: BoundingBox, b: BoundingBox): number { const left = Math.max(a[0], b[0]); const top = Math.max(a[1], b[1]); const right = Math.min(a[2], b[2]); const bottom = Math.min(a[3], b[3]); const intersection = Math.max(0, right - left) * Math.max(0, bottom - top); const union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - intersection; return union ? intersection / union : 0; }

export const asFaceRedactions = (faces: readonly FaceBox[]): RedactionRecord[] => faces.map((face) => ({ type: "FACE", token: null, bbox: face.bbox, method: "blur" }));
