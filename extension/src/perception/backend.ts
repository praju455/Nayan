import type * as ort from "onnxruntime-web";
import { browser } from "wxt/browser";
import type { BoundingBox, VisualElement } from "../shared/types";

export interface PerceptionBackend { load(): Promise<void>; analyze(image: ImageData, regions?: readonly { id: string; bbox: BoundingBox }[]): Promise<VisualElement[]>; dispose(): Promise<void>; readonly runtime: "webgpu" | "wasm" | "semantic"; }

const classes = ["button", "checkbox", "container", "dropdown", "icon_button", "image", "label", "link", "menu_item", "scrollbar", "slider", "tab", "text_input", "toggle", "unknown"] as const;

/** ONNX runtime is loaded locally. A GUI detector model is configured at runtime; no frame leaves this module. */
export class OnnxPerceptionBackend implements PerceptionBackend {
  private session?: ort.InferenceSession;
  private ortRuntime?: typeof ort;
  runtime: "webgpu" | "wasm" | "semantic" = "semantic";
  constructor(private readonly modelUrl: string) {}
  async load(): Promise<void> {
    try {
      // Both runtimes are packaged extension assets. Prefer WebGPU for local
      // inference, then fall back to cross-browser WASM and finally semantics.
      const runtimeUrl = (browser.runtime as unknown as { getURL(path: string): string }).getURL("ort/ort.wasm.min.mjs");
      const ortRuntime = await import(/* @vite-ignore */ runtimeUrl) as typeof ort;
      this.ortRuntime = ortRuntime;
      try {
        this.session = await ortRuntime.InferenceSession.create(this.modelUrl, { executionProviders: ["webgpu"] });
        this.runtime = "webgpu";
      } catch {
        this.session = await ortRuntime.InferenceSession.create(this.modelUrl, { executionProviders: ["wasm"] });
        this.runtime = "wasm";
      }
    } catch { this.runtime = "semantic"; }
  }
  async analyze(image: ImageData, regions: readonly { id: string; bbox: BoundingBox }[] = []): Promise<VisualElement[]> {
    if (!this.session || !this.ortRuntime) return [];
    const output: VisualElement[] = [];
    // Classify a bounded set of DOM-grounded local crops. Canvas/image-only boxes can be supplied by a detector later.
    for (const region of regions.slice(0, 24)) {
      const bitmap = await createImageBitmap(this.toModelImage(image, region.bbox));
      const tensor = await this.ortRuntime.Tensor.fromImage(bitmap, { tensorFormat: "RGB", tensorLayout: "NCHW", norm: { mean: [255 * 0.229, 255 * 0.224, 255 * 0.225], bias: [-255 * 0.485, -255 * 0.456, -255 * 0.406] } });
      bitmap.close();
      const results = await this.session.run({ [this.session.inputNames[0]!]: tensor });
      const logits = results[this.session.outputNames[0]!]?.data;
      if (!logits) continue;
      const values = Array.from(logits as ArrayLike<number>); const maximum = Math.max(...values); const exponentials = values.map((value) => Math.exp(value - maximum)); const total = exponentials.reduce((sum, value) => sum + value, 0); const index = exponentials.indexOf(Math.max(...exponentials));
      output.push({ id: region.id, type: classes[index] ?? "unknown", bbox: region.bbox, confidence: total ? exponentials[index]! / total : 0 });
    }
    return output;
  }
  private toModelImage(image: ImageData, bbox: BoundingBox): ImageData {
    const [left, top, right, bottom] = bbox.map(Math.round) as [number, number, number, number];
    const width = Math.max(1, Math.min(image.width - left, right - left)); const height = Math.max(1, Math.min(image.height - top, bottom - top));
    const source = new OffscreenCanvas(image.width, image.height); const sourceContext = source.getContext("2d"); if (!sourceContext) throw new Error("Local visual canvas unavailable"); sourceContext.putImageData(image, 0, 0);
    const output = new OffscreenCanvas(224, 224); const context = output.getContext("2d"); if (!context) throw new Error("Local visual canvas unavailable"); context.fillStyle = "rgb(128,128,128)"; context.fillRect(0, 0, 224, 224); const scale = Math.min(224 / width, 224 / height); const targetWidth = width * scale; const targetHeight = height * scale; context.drawImage(source, Math.max(0, left), Math.max(0, top), width, height, (224 - targetWidth) / 2, (224 - targetHeight) / 2, targetWidth, targetHeight); return context.getImageData(0, 0, 224, 224);
  }
  async dispose(): Promise<void> { await this.session?.release(); this.session = undefined; this.ortRuntime = undefined; }
}
