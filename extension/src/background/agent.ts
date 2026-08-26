import { captureLocalFrame } from "../capture/local-frame";
import { OnnxPerceptionBackend } from "../perception/backend";
import { sanitizeSemanticNodes, sanitizeTask } from "../privacy/sanitizer";
import { fuseSemanticAndVisual } from "../scene-fusion/fuse";
import { TokenVault } from "../token-vault/token-vault";
import { assertSafePayload } from "../payload-guard/guard";
import { requestNextAction } from "../transport/client";
import type { AgentAction, RawSemanticNode, SanitizedContextPackage } from "../shared/types";
import { browser } from "wxt/browser";

export class NayanAgent {
  private readonly vault = new TokenVault();
  private step = 0;
  private readonly perception = new OnnxPerceptionBackend((browser.runtime as unknown as { getURL(path: string): string }).getURL("models/ui-detector.onnx"));
  async start(tabId: number, task: string, serverUrl: string): Promise<AgentAction> {
    // This call creates a local-only raw frame. It is intentionally not passed to transport.
    const rawFrame = await captureLocalFrame();
    const [{ nodes }, vision] = await Promise.all([browser.tabs.sendMessage(tabId, { type: "NAYAN_EXTRACT_SEMANTICS" }) as Promise<{ nodes: RawSemanticNode[] }>, this.analyzeLocally(rawFrame.image)]);
    const sanitized = sanitizeSemanticNodes(nodes, this.vault);
    const payload: SanitizedContextPackage = { protocolVersion: "1.0", taskId: `task_${crypto.randomUUID()}`, screen: { width: rawFrame.width, height: rawFrame.height }, task: sanitizeTask(task, this.vault), elements: fuseSemanticAndVisual(nodes, sanitized.elements, vision), redactions: sanitized.redactions, state: { step: this.step++, pageFingerprint: await this.fingerprint(nodes) }, redactedScreenshot: null };
    return requestNextAction(serverUrl, assertSafePayload(payload));
  }
  private async analyzeLocally(image: ImageData) { await this.perception.load(); return this.perception.analyze(image); }
  private async fingerprint(nodes: readonly RawSemanticNode[]): Promise<string> { const data = new TextEncoder().encode(nodes.map(({ id, role, bbox }) => `${id}:${role}:${bbox.join(",")}`).join("|")); const digest = await crypto.subtle.digest("SHA-256", data); return [...new Uint8Array(digest)].slice(0, 8).map((byte) => byte.toString(16).padStart(2, "0")).join(""); }
}
