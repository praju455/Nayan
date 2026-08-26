import type { AgentAction, SanitizedElement } from "../shared/types";

const allowed = new Set<AgentAction["action"]>(["click", "type", "scroll", "select", "select_recipient", "focus", "navigate", "wait", "done", "confirm_needed"]);
const targetActions = new Set(["click", "type", "select", "focus"]);

export function validateLocalAction(action: AgentAction, elements: readonly SanitizedElement[], tokenExists: (token: string) => boolean): string | undefined {
  if (!allowed.has(action.action) || !Number.isFinite(action.confidence) || action.confidence < 0 || action.confidence > 1) return "Malformed action";
  if (targetActions.has(action.action)) { const target = elements.find((element) => element.id === action.targetId); if (!target || !target.visible || !target.interactive) return "Target is stale, hidden, or non-interactive"; if ((action.action === "type" || action.action === "select") && !action.valueToken) return "Changing a field requires a local token"; }
  if ((action.action === "type" || action.action === "select" || action.action === "select_recipient") && !action.valueToken) return "Changing a page field or selecting a conversation requires a local token";
  if (action.valueToken && !tokenExists(action.valueToken)) return "Requested token is unavailable locally";
  if (action.action === "navigate" && (!action.destination || !/^https?:\/\//.test(action.destination))) return "Unsafe navigation destination";
  return undefined;
}
