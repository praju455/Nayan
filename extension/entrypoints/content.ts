import { defineContentScript } from "wxt/utils/define-content-script";
import { browser } from "wxt/browser";
import { extractSemanticTree } from "../src/content/semantic-extractor";
import { executeAction } from "../src/action/executor";
import { recognizeSelectiveCanvasText } from "../src/ocr/selective-ocr";
import type { AgentAction } from "../src/shared/types";

// Production pages are injected only after the user opens Nayan on the
// active tab. The static demo match keeps local development friction-free.
export default defineContentScript({ matches: ["http://localhost:5173/*"], main() {
  browser.runtime.onMessage.addListener((message: { type?: string; action?: AgentAction; tokenValue?: string }) => {
    if (message.type === "NAYAN_PING") return Promise.resolve({ ready: true });
    if (message.type === "NAYAN_EXTRACT_SEMANTICS") { const nodes = extractSemanticTree(); nodes.forEach((node) => document.querySelector<HTMLElement>(`[data-nayan-id="${CSS.escape(node.id)}"]`)?.dataset.nayanId || undefined); return Promise.resolve({ nodes, viewport: { width: window.innerWidth, height: window.innerHeight } }); }
    if (message.type === "NAYAN_SELECTIVE_OCR") return recognizeSelectiveCanvasText();
    if (message.type === "NAYAN_EXECUTE" && message.action) return Promise.resolve(executeAction(message.action, () => message.tokenValue));
    return undefined;
  });
} });
