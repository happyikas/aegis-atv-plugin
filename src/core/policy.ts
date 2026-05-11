import type { ActionName } from "./types.js";

const HIGH_RISK_ACTIONS = new Set<ActionName>([
  "send_email",
  "modify_calendar",
  "delete_file",
  "external_share",
]);

export function isHighRiskAction(action: ActionName): boolean {
  return HIGH_RISK_ACTIONS.has(action);
}
