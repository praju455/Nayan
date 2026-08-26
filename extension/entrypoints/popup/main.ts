import { browser } from "wxt/browser";
import type { AgentAction } from "../../src/shared/types";
import type { SanitizedContextPackage } from "../../src/shared/types";
import "./style.css";

type Result = { status: "confirmation_required" | "done" | "acted" | "blocked"; action: AgentAction; redactionCount: number; modelRuntime: string; safeContext: SanitizedContextPackage; message?: string };
const task = document.querySelector<HTMLTextAreaElement>("#task")!;
const start = document.querySelector<HTMLButtonElement>("#start")!;
const confirm = document.querySelector<HTMLButtonElement>("#confirm")!;
const status = document.querySelector<HTMLElement>("#status")!;
const payload = document.querySelector<HTMLElement>("#payload")!;

function show(result: Result): void { status.textContent = `${result.status.replaceAll("_", " ")} · ${result.redactionCount} local redactions · ${result.modelRuntime.toUpperCase()} mode${result.message ? ` · ${result.message}` : ""}`; payload.textContent = JSON.stringify(result.safeContext, null, 2); confirm.hidden = result.status !== "confirmation_required"; start.disabled = result.status === "confirmation_required"; }
async function send(type: "NAYAN_START" | "NAYAN_CONFIRM"): Promise<void> { try { const result = await browser.runtime.sendMessage(type === "NAYAN_START" ? { type, task: task.value } : { type }) as Result; show(result); } catch (error) { status.textContent = error instanceof Error ? error.message : "Nayan could not safely continue."; } }
start.addEventListener("click", () => void send("NAYAN_START"));
confirm.addEventListener("click", () => void send("NAYAN_CONFIRM"));
