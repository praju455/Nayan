import { captureLocalFrame } from "../capture/local-frame";
import { OnnxPerceptionBackend } from "../perception/backend";
import { sanitizeSemanticNodes, sanitizeTask } from "../privacy/sanitizer";
import { createSanitizedOutput } from "../privacy/sanitized-output";
import { asFaceRedactions, OnnxFaceDetector } from "../face/onnx-face";
import { fuseSemanticAndVisual } from "../scene-fusion/fuse";
import { TokenVault } from "../token-vault/token-vault";
import { assertSafePayload } from "../payload-guard/guard";
import { requestNextAction } from "../transport/client";
import type { AgentAction, RawSemanticNode, SanitizedContextPackage } from "../shared/types";
import { browser } from "wxt/browser";
import { validateLocalAction } from "../action/validator";
import type { OcrText } from "../ocr/selective-ocr";

export type AgentRunResult = Readonly<{ status: "confirmation_required" | "done" | "acted" | "blocked"; action: AgentAction; redactionCount: number; modelRuntime: "webgpu" | "wasm" | "semantic"; safeContext: SanitizedContextPackage; message?: string }>;

export class NayanAgent {
  private readonly vault = new TokenVault();
  private step = 0;
  private active?: { tabId: number; task: string; serverUrl: string };
  private readonly perception = new OnnxPerceptionBackend((browser.runtime as unknown as { getURL(path: string): string }).getURL("models/mobilenetv3_small.onnx"));
  private readonly faceDetector = new OnnxFaceDetector();
  async start(tabId: number, task: string, serverUrl: string): Promise<AgentRunResult> { this.active = { tabId, task, serverUrl }; this.step = 0; return this.runStep(false); }
  async confirm(): Promise<AgentRunResult> { if (!this.active) throw new Error("No active Nayan task to confirm"); return this.runStep(true); }
  private async runStep(confirmed: boolean): Promise<AgentRunResult> {
    if (!this.active) throw new Error("No active Nayan task");
    const { tabId, task, serverUrl } = this.active;
    // This call creates a local-only raw frame. It is intentionally not passed to transport.
    const rawFrame = await captureLocalFrame();
    const { nodes: domNodes } = await browser.tabs.sendMessage(tabId, { type: "NAYAN_EXTRACT_SEMANTICS" }) as { nodes: RawSemanticNode[] };
    const ocr = await browser.tabs.sendMessage(tabId, { type: "NAYAN_SELECTIVE_OCR" }) as OcrText[];
    const nodes = [...domNodes, ...ocr.map((result, index): RawSemanticNode => ({ id: `ocr_${index}`, tag: "canvas", role: "text", text: result.text, bbox: result.bbox, visible: true, interactive: false, disabled: false, source: ["ocr"] }))];
    const vision = await this.analyzeLocally(rawFrame.image, nodes);
    const sanitized = sanitizeSemanticNodes(nodes, this.vault);
    const faceRedactions = asFaceRedactions(await this.faceDetector.detect(rawFrame.image));
    const elements = fuseSemanticAndVisual(nodes, sanitized.elements, vision);
    const redactions = [...sanitized.redactions, ...faceRedactions];
    const artifact = createSanitizedOutput({ rawFrame, taskId: `task_${crypto.randomUUID()}`, task: sanitizeTask(task, this.vault), elements, redactions, step: this.step++, pageFingerprint: await this.fingerprint(nodes), confirmed });
    // `artifact.context` is a separate sanitized object. Raw pixels are not reachable by transport.
    const action = await requestNextAction(serverUrl, assertSafePayload(artifact.context));
    if (action.action === "confirm_needed") return { status: "confirmation_required", action, redactionCount: redactions.length, modelRuntime: this.perception.runtime, safeContext: artifact.context, message: action.message };
    if (action.action === "done") { this.vault.clear(); this.active = undefined; return { status: "done", action, redactionCount: redactions.length, modelRuntime: this.perception.runtime, safeContext: artifact.context }; }
    const invalid = validateLocalAction(action, elements, (token) => this.vault.has(token));
    if (invalid) return { status: "blocked", action, redactionCount: redactions.length, modelRuntime: this.perception.runtime, safeContext: artifact.context, message: invalid };
    const outcome = await browser.tabs.sendMessage(tabId, { type: "NAYAN_EXECUTE", action, tokenValue: action.valueToken ? this.vault.resolve(action.valueToken) : undefined }) as { ok: boolean; reason?: string };
    if (!outcome.ok) return { status: "blocked", action, redactionCount: redactions.length, modelRuntime: this.perception.runtime, safeContext: artifact.context, message: outcome.reason };
    if (this.step < 10) { await new Promise<void>((resolve) => setTimeout(resolve, 180)); return this.runStep(false); }
    return { status: "blocked", action, redactionCount: redactions.length, modelRuntime: this.perception.runtime, safeContext: artifact.context, message: "Stopped after the maximum safe step count." };
  }
  private async analyzeLocally(image: ImageData, nodes: readonly RawSemanticNode[]) { await this.perception.load(); return this.perception.analyze(image, nodes.filter((node) => node.visible).map(({ id, bbox }) => ({ id, bbox }))); }
  private async fingerprint(nodes: readonly RawSemanticNode[]): Promise<string> { const data = new TextEncoder().encode(nodes.map(({ id, role, bbox }) => `${id}:${role}:${bbox.join(",")}`).join("|")); const digest = await crypto.subtle.digest("SHA-256", data); return [...new Uint8Array(digest)].slice(0, 8).map((byte) => byte.toString(16).padStart(2, "0")).join(""); }
}
