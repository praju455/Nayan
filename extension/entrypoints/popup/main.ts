import { browser } from "wxt/browser";
import type { AgentAction } from "../../src/shared/types";
import type { SanitizedContextPackage } from "../../src/shared/types";
import "./style.css";

type Result = { status: "confirmation_required" | "done" | "acted" | "blocked"; action: AgentAction; redactionCount: number; modelRuntime: string; safeContext: SanitizedContextPackage; localPreviewDataUrl?: string; message?: string };
const task = document.querySelector<HTMLTextAreaElement>("#task")!;
const draftText = document.querySelector<HTMLTextAreaElement>("#draft-text")!;
const start = document.querySelector<HTMLButtonElement>("#start")!;
const confirm = document.querySelector<HTMLButtonElement>("#confirm")!;
const autoDemo = document.querySelector<HTMLInputElement>("#auto-demo")!;
const allowSite = document.querySelector<HTMLButtonElement>("#allow-site")!;
const status = document.querySelector<HTMLElement>("#status")!;
const payload = document.querySelector<HTMLElement>("#payload")!;
const preview = document.querySelector<HTMLImageElement>("#preview")!;

function show(result: Result): void { status.textContent = `${result.status.replaceAll("_", " ")} · ${result.redactionCount} local redactions · ${result.modelRuntime.toUpperCase()} mode${result.message ? ` · ${result.message}` : ""}`; payload.textContent = JSON.stringify(result.safeContext, null, 2); preview.hidden = !result.localPreviewDataUrl; if (result.localPreviewDataUrl) preview.src = result.localPreviewDataUrl; confirm.hidden = result.status !== "confirmation_required"; start.disabled = result.status === "confirmation_required"; }
async function send(type: "NAYAN_START" | "NAYAN_CONFIRM"): Promise<void> { try { const result = await browser.runtime.sendMessage(type === "NAYAN_START" ? { type, task: task.value, draftText: draftText.value, autoSubmitDemo: autoDemo.checked } : { type }) as Result; show(result); } catch (error) { status.textContent = error instanceof Error ? error.message : "Nayan could not safely continue."; } }
start.addEventListener("click", () => void send("NAYAN_START"));
confirm.addEventListener("click", () => void send("NAYAN_CONFIRM"));
allowSite.addEventListener("click", () => void (async () => { try { const result = await browser.runtime.sendMessage({ type: "NAYAN_ALLOW_CURRENT_SITE" }) as { origin: string }; status.textContent = `Approved ${result.origin}. You can now start Nayan on this site.`; } catch (error) { status.textContent = error instanceof Error ? error.message : "Nayan could not approve this site."; } })());
