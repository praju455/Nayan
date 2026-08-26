import type { AgentAction } from "../shared/types";

function target(id: string | undefined): HTMLElement | undefined { return id ? document.querySelector<HTMLElement>(`[data-nayan-id="${CSS.escape(id)}"]`) ?? undefined : undefined; }

function typeIntoContentEditable(element: HTMLElement, value: string): void {
  element.focus();
  // execCommand remains the most broadly compatible way to produce the input
  // event that framework-controlled chat composers expect. It runs only after
  // the planner has supplied a locally held token and the action validator has
  // grounded the target in the active page.
  const inserted = document.execCommand?.("insertText", false, value);
  if (!inserted) {
    element.textContent = value;
    element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
  }
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

export function executeAction(action: AgentAction, resolveToken: (token: string) => string | undefined): { ok: boolean; reason?: string } {
  const element = target(action.targetId);
  if (["click", "type", "select", "focus"].includes(action.action) && !element) return { ok: false, reason: "Target changed before execution" };
  switch (action.action) {
    case "click": element!.click(); return { ok: true };
    case "focus": element!.focus(); return { ok: true };
    case "type": {
      const value = action.valueToken ? resolveToken(action.valueToken) : undefined;
      if (value === undefined) return { ok: false, reason: "Token or text field unavailable" };
      const field = element!;
      if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
        field.focus();
        field.value = value;
        field.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
        field.dispatchEvent(new Event("change", { bubbles: true }));
        return { ok: true };
      }
      if (field.isContentEditable) { typeIntoContentEditable(field, value); return { ok: true }; }
      return { ok: false, reason: "Token or text field unavailable" };
    }
    case "select": { const value = action.valueToken ? resolveToken(action.valueToken) : undefined; if (value === undefined || !(element instanceof HTMLSelectElement)) return { ok: false, reason: "Token or select field unavailable" }; element.focus(); element.value = value; element.dispatchEvent(new Event("input", { bubbles: true })); element.dispatchEvent(new Event("change", { bubbles: true })); return { ok: true }; }
    case "scroll": window.scrollBy({ top: action.deltaY ?? 500, behavior: "smooth" }); return { ok: true };
    case "navigate": if (action.destination) { window.location.assign(action.destination); return { ok: true }; } return { ok: false, reason: "Missing destination" };
    case "wait": case "done": case "confirm_needed": return { ok: true };
    default: return { ok: false, reason: "Action is not executable" };
  }
}
