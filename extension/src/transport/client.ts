import { assertSafePayload } from "../payload-guard/guard";
import type { AgentAction, SanitizedContextPackage } from "../shared/types";

/** Deliberately accepts only SanitizedContextPackage: raw frames cannot cross this API. */
export async function requestNextAction(serverUrl: string, safeContext: SanitizedContextPackage): Promise<AgentAction> {
  const body = assertSafePayload(safeContext);
  const response = await fetch(`${serverUrl.replace(/\/$/, "")}/v1/agent/next-action`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`Planner request blocked: ${response.status}`);
  return response.json() as Promise<AgentAction>;
}
