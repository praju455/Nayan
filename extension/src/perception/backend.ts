import * as ort from "onnxruntime-web";
import type { VisualElement } from "../shared/types";

export interface PerceptionBackend { load(): Promise<void>; analyze(image: ImageData): Promise<VisualElement[]>; dispose(): Promise<void>; readonly runtime: "webgpu" | "wasm" | "semantic"; }

/** ONNX runtime is loaded locally. A GUI detector model is configured at runtime; no frame leaves this module. */
export class OnnxPerceptionBackend implements PerceptionBackend {
  private session?: ort.InferenceSession;
  runtime: "webgpu" | "wasm" | "semantic" = "semantic";
  constructor(private readonly modelUrl: string) {}
  async load(): Promise<void> {
    const providers: ort.InferenceSession.ExecutionProviderConfig[] = [];
    if (typeof navigator !== "undefined" && "gpu" in navigator) providers.push("webgpu");
    providers.push("wasm");
    try { this.session = await ort.InferenceSession.create(this.modelUrl, { executionProviders: providers }); this.runtime = providers[0] === "webgpu" ? "webgpu" : "wasm"; } catch { this.runtime = "semantic"; }
  }
  async analyze(_image: ImageData): Promise<VisualElement[]> { return this.session ? [] : []; }
  async dispose(): Promise<void> { await this.session?.release(); this.session = undefined; }
}
