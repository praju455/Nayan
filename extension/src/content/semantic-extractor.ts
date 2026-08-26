import type { BoundingBox, RawSemanticNode } from "../shared/types";

// Labels describe controls but are not independently sensitive regions. The
// actual input/select owns the value and its exact box is what we redact.
const selector = "button, a, input, textarea, select, [role], [contenteditable], img, canvas";

function boundingBox(element: Element): BoundingBox {
  const box = element.getBoundingClientRect();
  return [Math.round(box.left), Math.round(box.top), Math.round(box.right), Math.round(box.bottom)];
}

function isVisible(element: Element): boolean {
  const style = window.getComputedStyle(element);
  const box = element.getBoundingClientRect();
  return style.display !== "none" && style.visibility !== "hidden" && Number(style.opacity) > 0 && box.width > 0 && box.height > 0;
}

function labelFor(element: HTMLElement): string | undefined {
  const labelled = element.getAttribute("aria-labelledby")?.split(/\s+/).map((id) => document.getElementById(id)?.textContent?.trim()).filter(Boolean).join(" ");
  const wrappingLabel = element.closest("label")?.childNodes[0]?.textContent?.trim();
  return element.getAttribute("aria-label")?.trim() || labelled || (element instanceof HTMLInputElement ? document.querySelector(`label[for="${CSS.escape(element.id)}"]`)?.textContent?.trim() : undefined) || wrappingLabel || element.getAttribute("placeholder")?.trim() || undefined;
}

export function extractSemanticTree(): RawSemanticNode[] {
  let sequence = 0;
  return [...document.querySelectorAll<HTMLElement>(selector)].filter(isVisible).map((element) => {
    sequence += 1;
    const id = element.dataset.nayanId || `n_${sequence}`;
    element.dataset.nayanId = id;
    const input = element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement ? element : undefined;
    const editable = element.isContentEditable;
    const disabled = "disabled" in element && Boolean((element as HTMLInputElement).disabled);
    const role = element.getAttribute("role") || (editable ? "textbox" : element instanceof HTMLButtonElement ? "button" : element instanceof HTMLAnchorElement ? "link" : element instanceof HTMLSelectElement ? "combobox" : element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement ? "textbox" : element.tagName.toLowerCase());
    const interactive = !disabled && (element.matches("button, a, input, textarea, select, [role='button'], [role='link'], [contenteditable]") || element.tabIndex >= 0);
    return { id, tag: element.tagName.toLowerCase(), role, label: labelFor(element), text: element.childElementCount === 0 ? element.textContent?.trim().slice(0, 1000) || undefined : undefined, value: input?.value || undefined, inputType: editable ? "contenteditable" : element instanceof HTMLInputElement ? element.type : undefined, autocomplete: element.getAttribute("autocomplete") || undefined, bbox: boundingBox(element), visible: true, interactive, disabled, source: element.getAttribute("role") ? ["dom", "aria"] : ["dom"] } as RawSemanticNode;
  });
}
