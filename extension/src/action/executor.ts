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

function normalizeText(value: string): string { return value.replace(/\s+/g, " ").trim().toLocaleLowerCase(); }
function escapeRegExp(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function visible(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);
  const box = element.getBoundingClientRect();
  return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0 && box.width > 0 && box.height > 0;
}

function recipientTarget(value: string): HTMLElement | undefined {
  const expected = normalizeText(value);
  const interactive = "a, button, [role='button'], [role='link'], [tabindex]";
  const candidates = [...document.querySelectorAll<HTMLElement>(interactive)].filter(visible);
  const exact = candidates.find((element) => normalizeText(element.textContent || "") === expected);
  if (exact) return exact;
  const word = new RegExp(`(^|\\s)${escapeRegExp(expected)}(?=\\s|$)`, "i");
  return candidates.find((element) => word.test(normalizeText(element.textContent || "")));
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
    case "select_recipient": {
      const value = action.valueToken ? resolveToken(action.valueToken) : undefined;
      const recipient = value ? recipientTarget(value) : undefined;
      if (!recipient) return { ok: false, reason: "The requested conversation is not visible in the current search results." };
      recipient.click();
      return { ok: true };
    }
    case "scroll": window.scrollBy({ top: action.deltaY ?? 500, behavior: "smooth" }); return { ok: true };
    case "navigate": if (action.destination) { window.location.assign(action.destination); return { ok: true }; } return { ok: false, reason: "Missing destination" };
    case "wait": case "done": case "confirm_needed": return { ok: true };
    default: return { ok: false, reason: "Action is not executable" };
  }
}
