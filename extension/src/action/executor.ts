import type { AgentAction } from "../shared/types";

function target(id: string | undefined): HTMLElement | undefined { return id ? document.querySelector<HTMLElement>(`[data-nayan-id="${CSS.escape(id)}"]`) ?? undefined : undefined; }

export function executeAction(action: AgentAction, resolveToken: (token: string) => string | undefined): { ok: boolean; reason?: string } {
  const element = target(action.targetId);
  if (["click", "type", "select", "focus"].includes(action.action) && !element) return { ok: false, reason: "Target changed before execution" };
  switch (action.action) {
    case "click": element!.click(); return { ok: true };
    case "focus": element!.focus(); return { ok: true };
    case "type": { const value = action.valueToken ? resolveToken(action.valueToken) : undefined; if (value === undefined || !(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) return { ok: false, reason: "Token or text field unavailable" }; element.focus(); element.value = value; element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value })); element.dispatchEvent(new Event("change", { bubbles: true })); return { ok: true }; }
    case "scroll": window.scrollBy({ top: action.deltaY ?? 500, behavior: "smooth" }); return { ok: true };
    case "navigate": if (action.destination) { window.location.assign(action.destination); return { ok: true }; } return { ok: false, reason: "Missing destination" };
    case "wait": case "done": case "confirm_needed": return { ok: true };
    default: return { ok: false, reason: "Action is not executable" };
  }
}
