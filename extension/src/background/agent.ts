import { captureLocalFrame } from "../capture/local-frame";
import { OnnxPerceptionBackend } from "../perception/backend";
import { sanitizeSemanticNodes, sanitizeTask } from "../privacy/sanitizer";
import { createSanitizedOutput, localPreviewDataUrl } from "../privacy/sanitized-output";
import { asFaceRedactions, OnnxFaceDetector } from "../face/onnx-face";
import { fuseSemanticAndVisual } from "../scene-fusion/fuse";
import { TokenVault } from "../token-vault/token-vault";
import { assertSafePayload } from "../payload-guard/guard";
import { requestNextAction } from "../transport/client";
import type { AgentAction, RawSemanticNode, SanitizedContextPackage, SanitizedTab } from "../shared/types";
import { browser } from "wxt/browser";
import { validateLocalAction } from "../action/validator";
import type { OcrText } from "../ocr/selective-ocr";
import { alignNodesToCapture, type Viewport } from "../capture/coordinates";
import { confirmationForAction } from "../policy/action-policy";
import { allowSite, isSiteAllowed } from "../policy/site-policy";

export type AgentRunResult = Readonly<{ status: "confirmation_required" | "done" | "acted" | "blocked"; action: AgentAction; redactionCount: number; modelRuntime: "webgpu" | "wasm" | "semantic"; safeContext: SanitizedContextPackage; localPreviewDataUrl?: string; message?: string }>;
type ActiveTask = Readonly<{ tabId: number; task: string; serverUrl: string; autoSubmitDemo: boolean; pendingNavigation?: string }>;
const activeTaskKey = "nayanActiveTask";

function privateDraftInstruction(task: string): string {
  return task.split("\nPrivate chat recipient:", 1)[0]?.split("\nPrivate draft text:", 1)[0] ?? task;
}
function isPrivateDraftTask(task: string): boolean { return /<USER_PROVIDED_TEXT_[A-Za-z0-9_-]+>/.test(task); }
function userRequestedSend(task: string): boolean { return /\b(send|submit)\b/i.test(privateDraftInstruction(task)); }
function isRegularHttpUrl(url: string | undefined): url is string { return Boolean(url && /^https?:\/\//.test(url)); }

export class NayanAgent {
  private readonly vault = new TokenVault();
  private step = 0;
  private active?: ActiveTask;
  private readonly perception = new OnnxPerceptionBackend((browser.runtime as unknown as { getURL(path: string): string }).getURL("models/mobilenetv3_small.onnx"));
  private readonly faceDetector = new OnnxFaceDetector();
  async start(tabId: number, task: string, serverUrl: string, autoSubmitDemo = false, draftText?: string, recipient?: string): Promise<AgentRunResult> {
    // Only the already-sanitized task survives a service-worker suspension.
    this.active = { tabId, task: sanitizeTask(task, this.vault, draftText, recipient), serverUrl, autoSubmitDemo };
    await browser.storage.session.set({ [activeTaskKey]: this.active });
    this.step = 0;
    return this.runStep(false);
  }
  async confirm(): Promise<AgentRunResult> {
    if (!this.active) this.active = await this.restoreActiveTask();
    if (!this.active) throw new Error("No active Nayan task to confirm");
    if (this.active.pendingNavigation) return this.executePendingNavigation(this.active.pendingNavigation);
    return this.runStep(true);
  }
  private async restoreActiveTask(): Promise<ActiveTask | undefined> {
    const stored = (await browser.storage.session.get(activeTaskKey))[activeTaskKey] as Partial<ActiveTask> | undefined;
    return stored && Number.isInteger(stored.tabId) && typeof stored.task === "string" && typeof stored.serverUrl === "string"
      ? { ...stored, autoSubmitDemo: stored.autoSubmitDemo === true, pendingNavigation: typeof stored.pendingNavigation === "string" ? stored.pendingNavigation : undefined } as ActiveTask
      : undefined;
  }
  private async clearActiveTask(): Promise<void> {
    this.active = undefined;
    await browser.storage.session.remove(activeTaskKey);
  }
  /**
   * Static injection can be skipped when Chrome restores a tab created before
   * the extension was installed or reloaded. Verify the receiver and inject
   * our already-packaged content script on demand in that case.
   */
  private async sendToContent<T>(tabId: number, message: unknown): Promise<T> {
    try {
      await browser.tabs.sendMessage(tabId, { type: "NAYAN_PING" });
    } catch {
      await browser.scripting.executeScript({ target: { tabId }, files: ["content-scripts/content.js"] });
    }
    return browser.tabs.sendMessage(tabId, message) as Promise<T>;
  }
  private async runStep(confirmed: boolean): Promise<AgentRunResult> {
    if (!this.active) throw new Error("No active Nayan task");
    const { tabId, task, serverUrl } = this.active;
    const tabs = await this.safeTabs();
    const currentTab = await browser.tabs.get(tabId);
    // Chrome does not allow extensions to capture or inject into chrome://newtab.
    // Plan only from the already-sanitized task and public tab origins, then ask
    // the user before the first site navigation.
    if (!isRegularHttpUrl(currentTab.url)) return this.planInitialNavigation(tabs);
    // This call creates a local-only raw frame. It is intentionally not passed to transport.
    const rawFrame = await captureLocalFrame();
    const { nodes: domNodes, viewport } = await this.sendToContent<{ nodes: RawSemanticNode[]; viewport: Viewport }>(tabId, { type: "NAYAN_EXTRACT_SEMANTICS" });
    const ocr = await this.sendToContent<OcrText[]>(tabId, { type: "NAYAN_SELECTIVE_OCR" });
    const semanticNodes = [...domNodes, ...ocr.map((result, index): RawSemanticNode => ({ id: `ocr_${index}`, tag: "canvas", role: "text", text: result.text, bbox: result.bbox, visible: true, interactive: false, disabled: false, source: ["ocr"] }))];
    const nodes = alignNodesToCapture(semanticNodes, viewport, rawFrame);
    const vision = await this.analyzeLocally(rawFrame.image, nodes);
    const sanitized = sanitizeSemanticNodes(nodes, this.vault);
    const faceRedactions = asFaceRedactions(await this.faceDetector.detect(rawFrame.image));
    const elements = fuseSemanticAndVisual(nodes, sanitized.elements, vision);
    const redactions = [...sanitized.redactions, ...faceRedactions];
    const artifact = createSanitizedOutput({ rawFrame, taskId: `task_${crypto.randomUUID()}`, task, tabs, elements, redactions, step: this.step++, pageFingerprint: await this.fingerprint(nodes), confirmed });
    // The popup gets a local redacted preview; the server gets context only.
    const preview = await localPreviewDataUrl(artifact.redactedPixels);
    // `artifact.context` is a separate sanitized object. Raw pixels are not reachable by transport.
    const action = await requestNextAction(serverUrl, assertSafePayload(artifact.context));
    if (action.action === "confirm_needed") {
      if (this.active.autoSubmitDemo) return this.runStep(true);
      return { status: "confirmation_required", action, redactionCount: redactions.length, modelRuntime: this.perception.runtime, safeContext: artifact.context, localPreviewDataUrl: preview, message: action.message };
    }
    if (action.action === "done") { this.vault.clear(); await this.clearActiveTask(); return { status: "done", action, redactionCount: redactions.length, modelRuntime: this.perception.runtime, safeContext: artifact.context, localPreviewDataUrl: preview }; }
    if (action.action === "activate_tab") {
      if (!action.tabId || !tabs.some((tab) => tab.id === action.tabId)) return { status: "blocked", action, redactionCount: redactions.length, modelRuntime: this.perception.runtime, safeContext: artifact.context, localPreviewDataUrl: preview, message: "Planner selected an unknown browser tab." };
      const targetTab = await browser.tabs.get(action.tabId);
      if (!targetTab.url || !(await isSiteAllowed(targetTab.url))) return { status: "blocked", action, redactionCount: redactions.length, modelRuntime: this.perception.runtime, safeContext: artifact.context, localPreviewDataUrl: preview, message: "Approve that tab's site before Nayan can switch to it." };
      await browser.tabs.update(action.tabId, { active: true });
      this.active = { ...this.active, tabId: action.tabId };
      await browser.storage.session.set({ [activeTaskKey]: this.active });
      await new Promise<void>((resolve) => setTimeout(resolve, 300));
      return this.runStep(false);
    }
    if (action.action === "navigate") return this.requestNavigationConfirmation(action, redactions.length, artifact.context, preview);
    const confirmation = confirmationForAction(action, elements);
    if (confirmation && !confirmed) {
      const confirmationAction: AgentAction = { action: "confirm_needed", confidence: 0.99, reason: confirmation.reason, message: confirmation.message };
      return { status: "confirmation_required", action: confirmationAction, redactionCount: redactions.length, modelRuntime: this.perception.runtime, safeContext: artifact.context, localPreviewDataUrl: preview, message: confirmation.message };
    }
    const invalid = validateLocalAction(action, elements, (token) => this.vault.has(token));
    if (invalid) return { status: "blocked", action, redactionCount: redactions.length, modelRuntime: this.perception.runtime, safeContext: artifact.context, localPreviewDataUrl: preview, message: invalid };
    const outcome = await this.sendToContent<{ ok: boolean; reason?: string }>(tabId, { type: "NAYAN_EXECUTE", action, tokenValue: action.valueToken ? this.vault.resolve(action.valueToken) : undefined });
    if (!outcome.ok) return { status: "blocked", action, redactionCount: redactions.length, modelRuntime: this.perception.runtime, safeContext: artifact.context, localPreviewDataUrl: preview, message: outcome.reason };
    // A user-provided chat draft is deliberately a single safe action. Some
    // rich-text web composers do not expose their new value on the container
    // itself, so re-reading the page could otherwise look like an empty field
    // and repeat the draft. Stop before a second pass, never near Send.
    if (action.action === "type" && action.valueToken?.startsWith("USER_PROVIDED_TEXT_")) {
      if (userRequestedSend(task)) {
        const confirmation: AgentAction = {
          action: "confirm_needed",
          confidence: 0.99,
          reason: "The private message draft is ready. Sending it is an external action and requires one final confirmation.",
          message: "Send this drafted message?",
        };
        return { status: "confirmation_required", action: confirmation, redactionCount: redactions.length, modelRuntime: this.perception.runtime, safeContext: artifact.context, localPreviewDataUrl: preview, message: confirmation.message };
      }
      this.vault.clear();
      await this.clearActiveTask();
      return { status: "done", action, redactionCount: redactions.length, modelRuntime: this.perception.runtime, safeContext: artifact.context, localPreviewDataUrl: preview, message: "Draft entered locally. Nayan stopped without sending it." };
    }
    if (confirmed && action.action === "click" && isPrivateDraftTask(task) && userRequestedSend(task)) {
      this.vault.clear();
      await this.clearActiveTask();
      return { status: "done", action, redactionCount: redactions.length, modelRuntime: this.perception.runtime, safeContext: artifact.context, localPreviewDataUrl: preview, message: "Message sent after your confirmation." };
    }
    // Chrome allows at most two captureVisibleTab calls per second. Leave a
    // deliberate buffer so multi-field tasks remain reliable on every step.
    if (this.step < 10) { await new Promise<void>((resolve) => setTimeout(resolve, 650)); return this.runStep(false); }
    return { status: "blocked", action, redactionCount: redactions.length, modelRuntime: this.perception.runtime, safeContext: artifact.context, localPreviewDataUrl: preview, message: "Stopped after the maximum safe step count." };
  }
  private async planInitialNavigation(tabs: SanitizedTab[]): Promise<AgentRunResult> {
    if (!this.active) throw new Error("No active Nayan task");
    const context: SanitizedContextPackage = {
      protocolVersion: "1.0",
      taskId: `task_${crypto.randomUUID()}`,
      screen: { width: 1, height: 1 },
      task: this.active.task,
      tabs,
      elements: [],
      redactions: [],
      state: { step: this.step++, pageFingerprint: "fp_newtab_navigation" },
      redactedScreenshot: null,
    };
    const action = await requestNextAction(this.active.serverUrl, assertSafePayload(context));
    if (action.action === "navigate") return this.requestNavigationConfirmation(action, 0, context);
    return {
      status: "blocked",
      action,
      redactionCount: 0,
      modelRuntime: "semantic",
      safeContext: context,
      message: "Nayan could not identify a safe website to open. Name the site clearly, for example: ‘Open Instagram, then …’."
    };
  }
  private async requestNavigationConfirmation(action: AgentAction, redactionCount: number, safeContext: SanitizedContextPackage, localPreviewDataUrl?: string): Promise<AgentRunResult> {
    if (!this.active || !action.destination || !isRegularHttpUrl(action.destination)) {
      return { status: "blocked", action, redactionCount, modelRuntime: this.perception.runtime, safeContext, localPreviewDataUrl, message: "Nayan rejected an unsafe navigation destination." };
    }
    this.active = { ...this.active, pendingNavigation: action.destination };
    await browser.storage.session.set({ [activeTaskKey]: this.active });
    const origin = new URL(action.destination).origin;
    const confirmationAction: AgentAction = {
      action: "confirm_needed",
      confidence: 0.99,
      reason: "Opening a new website requires local approval before Nayan can continue the task.",
      message: `Open ${origin} and continue this task?`,
    };
    return { status: "confirmation_required", action: confirmationAction, redactionCount, modelRuntime: this.perception.runtime, safeContext, localPreviewDataUrl, message: confirmationAction.message };
  }
  private async executePendingNavigation(destination: string): Promise<AgentRunResult> {
    if (!this.active || !isRegularHttpUrl(destination)) throw new Error("No safe navigation is pending");
    await allowSite(destination);
    const { pendingNavigation: _pendingNavigation, ...continuingTask } = this.active;
    this.active = continuingTask;
    await browser.storage.session.set({ [activeTaskKey]: this.active });
    await browser.tabs.update(this.active.tabId, { active: true, url: destination });
    // Give a navigation enough time to create its first usable document before
    // the regular local DOM/screenshot pipeline resumes.
    await new Promise<void>((resolve) => setTimeout(resolve, 1000));
    return this.runStep(false);
  }
  private async analyzeLocally(image: ImageData, nodes: readonly RawSemanticNode[]) { await this.perception.load(); return this.perception.analyze(image, nodes.filter((node) => node.visible).map(({ id, bbox }) => ({ id, bbox }))); }
  private async safeTabs(): Promise<SanitizedTab[]> {
    const tabs = await browser.tabs.query({ currentWindow: true });
    return tabs.flatMap((tab) => {
      if (!Number.isInteger(tab.id) || !tab.url) return [];
      try {
        const url = new URL(tab.url);
        if (!/^https?:$/.test(url.protocol)) return [];
        return [{ id: tab.id!, origin: url.origin, title: tab.title ? sanitizeTask(tab.title, this.vault) : undefined, active: tab.active === true }];
      } catch { return []; }
    });
  }
  private async fingerprint(nodes: readonly RawSemanticNode[]): Promise<string> {
    const data = new TextEncoder().encode(nodes.map(({ id, role, bbox }) => `${id}:${role}:${bbox.join(",")}`).join("|"));
    const digest = await crypto.subtle.digest("SHA-256", data);
    // An alphabetic encoding prevents a hash fragment from resembling a phone,
    // account, Aadhaar, or card number to the outbound privacy gate.
    return `fp_${[...new Uint8Array(digest)].slice(0, 8).map((byte) => String.fromCharCode(97 + (byte >> 4), 97 + (byte & 15))).join("")}`;
  }
}
