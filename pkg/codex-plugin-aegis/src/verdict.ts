export type AegisVerdict =
  | "observe_only"
  | "allow"
  | "allow_with_record"
  | "require_approval"
  | "block"
  | "quarantine";

export interface HookCommandOutcome {
  continue: boolean;
  event?: string;
  verdict?: AegisVerdict;
  event_id?: string;
  telemetry_id?: string;
  approval_id?: string;
  reason?: string;
  detail?: string;
  blocked?: boolean;
  approval_required?: boolean;
  suppressed_hook_error?: boolean;
}

export interface VerdictTranslationInput {
  event: string;
  verdict: AegisVerdict;
  event_id?: string;
  telemetry_id?: string;
  approval_id?: string;
  detail?: string;
}

export function translateVerdict(input: VerdictTranslationInput): HookCommandOutcome {
  if (input.verdict === "allow" || input.verdict === "allow_with_record" || input.verdict === "observe_only") {
    return {
      continue: true,
      event: input.event,
      verdict: input.verdict,
      event_id: input.event_id,
      telemetry_id: input.telemetry_id,
      detail: input.detail,
    };
  }

  if (input.verdict === "require_approval" || input.verdict === "quarantine") {
    return {
      continue: false,
      event: input.event,
      verdict: input.verdict,
      event_id: input.event_id,
      telemetry_id: input.telemetry_id,
      approval_id: input.approval_id,
      approval_required: true,
      reason: input.verdict === "quarantine" ? "aegis_quarantine" : "aegis_requires_approval",
      detail: input.detail,
    };
  }

  return {
    continue: false,
    event: input.event,
    verdict: input.verdict,
    event_id: input.event_id,
    telemetry_id: input.telemetry_id,
    blocked: true,
    reason: "aegis_blocked",
    detail: input.detail,
  };
}
