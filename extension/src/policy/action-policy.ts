import type { AgentAction, SanitizedElement } from "../shared/types";

export type ConfirmationRequirement = Readonly<{ message: string; reason: string }>;

// This safeguard is local and planner-independent. A future model cannot turn
// a draft into a real-world side effect merely by returning a click action.
const highImpactWords = /\b(send|submit|pay|purchase|order|book|delete|remove|transfer|publish|post|share|confirm)\b/i;

export function confirmationForAction(action: AgentAction, elements: readonly SanitizedElement[]): ConfirmationRequirement | undefined {
  if (action.action !== "click") return undefined;
  const target = elements.find((element) => element.id === action.targetId);
  const targetText = [target?.label, target?.text].filter(Boolean).join(" ");
  if (!highImpactWords.test(targetText)) return undefined;
  return {
    message: `Confirm this action: ${targetText.slice(0, 120)}?`,
    reason: "This click can create an external or irreversible result and requires local confirmation.",
  };
}
