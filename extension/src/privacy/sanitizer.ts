import { recognizePii, sensitiveCategoryFromDom } from "../pii/recognizer";
import { TokenVault } from "../token-vault/token-vault";
import type { PiiCategory, RawSemanticNode, RedactionRecord, SanitizedElement } from "../shared/types";

const methodFor = (category: PiiCategory): RedactionRecord["method"] => category === "FACE" ? "blur" : category === "PASSWORD" ? "black" : "tokenize";
const emptyBox: readonly [number, number, number, number] = [0, 0, 0, 0];

export type SanitizationResult = Readonly<{ elements: SanitizedElement[]; redactions: RedactionRecord[] }>;

function replacePii(value: string, vault: TokenVault, fallback?: PiiCategory): { value: string; records: { category: PiiCategory; token: string | null }[] } {
  // DOM semantics are stronger than a generic numeric recognizer for form values.
  const privateTaskValue = !fallback && value ? vault.findByValue(value) : undefined;
  const matches = fallback && value
    ? [{ category: fallback, value, start: 0, end: value.length, confidence: 1 }]
    : privateTaskValue
      ? [{ category: privateTaskValue.category, value, start: 0, end: value.length, confidence: 1 }]
      : recognizePii(value);
  let offset = 0; let sanitized = value; const records: { category: PiiCategory; token: string | null }[] = [];
  for (const match of matches) { const token = match.category === "PASSWORD" ? null : privateTaskValue?.category === match.category && privateTaskValue.token ? privateTaskValue.token : vault.tokenize(match.category, match.value); const replacement = token ? `<${token}>` : "<PASSWORD_FIELD>"; const start = match.start + offset; sanitized = `${sanitized.slice(0, start)}${replacement}${sanitized.slice(start + match.value.length)}`; offset += replacement.length - match.value.length; records.push({ category: match.category, token }); }
  return { value: sanitized, records };
}

/**
 * The task instruction can be sent only after ordinary PII replacement. Any
 * exact text that Nayan may type is more sensitive: it is always represented
 * by a task-scoped token, even when it does not look like conventional PII.
 */
export function sanitizeTask(task: string, vault: TokenVault, draftText?: string, recipient?: string): string {
  const instruction = replacePii(task, vault).value;
  const privateDraft = draftText?.trim();
  const privateRecipient = recipient?.trim();
  const details: string[] = [];
  if (privateRecipient) {
    const token = vault.tokenize("USER_SELECTED_RECIPIENT", privateRecipient);
    details.push(`Private chat recipient: <${token}>. Open only the exact visible matching conversation.`);
  }
  if (privateDraft) {
    const token = vault.tokenize("USER_PROVIDED_TEXT", privateDraft);
    details.push(`Private draft text: <${token}>. Type it only into a visible message composer or text field. Never send, submit, or click a send control.`);
  }
  return details.length ? `${instruction}\n${details.join("\n")}` : instruction;
}

export function sanitizeSemanticNodes(nodes: readonly RawSemanticNode[], vault: TokenVault): SanitizationResult {
  const redactions: RedactionRecord[] = [];
  const elements = nodes.map((node) => {
    const category = sensitiveCategoryFromDom(node);
    const privateValue = node.value || node.text || "";
    const result = replacePii(privateValue, vault, category);
    for (const record of result.records) redactions.push({ type: record.category, token: record.token, bbox: node.bbox, method: methodFor(record.category) });
    if (category && result.records.length === 0) redactions.push({ type: category, token: null, bbox: node.bbox, method: methodFor(category) });
    return { id: node.id, role: node.role, semanticType: category?.toLowerCase() || node.inputType, label: node.label ? replacePii(node.label, vault).value : undefined, text: privateValue ? result.value : undefined, bbox: node.bbox, visible: node.visible, interactive: node.interactive, confidence: 0.99, source: node.source };
  });
  return { elements, redactions };
}

export function redactImageLocally(raw: ImageData, redactions: readonly RedactionRecord[]): ImageData {
  const copy = new ImageData(new Uint8ClampedArray(raw.data), raw.width, raw.height);
  const canvas = new OffscreenCanvas(copy.width, copy.height); const context = canvas.getContext("2d"); if (!context) return copy;
  context.putImageData(copy, 0, 0);
  for (const redaction of redactions) { const [left, top, right, bottom] = redaction.bbox || emptyBox; const width = Math.max(0, right - left); const height = Math.max(0, bottom - top); if (redaction.method === "blur") { const source = new OffscreenCanvas(copy.width, copy.height); const sourceContext = source.getContext("2d"); sourceContext?.putImageData(context.getImageData(0, 0, copy.width, copy.height), 0, 0); context.filter = "blur(12px)"; context.drawImage(source, left, top, width, height, left, top, width, height); context.filter = "none"; } else { context.fillStyle = "#000"; context.fillRect(left, top, width, height); } }
  return context.getImageData(0, 0, copy.width, copy.height);
}
