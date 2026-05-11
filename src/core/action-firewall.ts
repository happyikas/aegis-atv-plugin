import { isHighRiskAction } from "./policy.js";
import { summarizeProvenance } from "./provenance.js";
import { buildTelemetryVector } from "./telemetry.js";
import type { IntegrityBaselineStore } from "./integrity.js";
import type {
  ActionEvaluation,
  ActionRequest,
  BlastRadius,
  FirewallVerdict,
  IntentDivergence,
} from "./types.js";

function classifyBlastRadius(action: ActionRequest["action"]): BlastRadius {
  switch (action) {
    case "read_file":
    case "search_memory":
      return "low";
    case "modify_calendar":
    case "send_email":
      return "medium";
    case "external_share":
      return "high";
    case "delete_file":
      return "critical";
  }
}

function keywordHit(text: string, patterns: string[]): boolean {
  return patterns.some((pattern) => text.includes(pattern));
}

export function detectIntentDivergence(request: ActionRequest, blastRadius: BlastRadius): IntentDivergence {
  const intent = (request.context?.declared_intent ?? "").toLowerCase();
  const reasons: string[] = [];

  if (!intent) {
    return {
      score: 0,
      threshold: 0.65,
      violated: false,
      reasons,
    };
  }

  const safeIntent =
    keywordHit(intent, ["summar", "review", "inspect", "read", "analy", "search", "audit"]) &&
    !keywordHit(intent, ["delete", "share", "email", "calendar", "send"]);
  const destructiveAction =
    blastRadius === "high" || blastRadius === "critical" || request.action === "send_email";
  let score = 0;

  if (safeIntent && destructiveAction) {
    score += 0.8;
    reasons.push("declared_intent_looks_observational_but_action_has_side_effects");
  }

  if (request.action === "external_share" && !keywordHit(intent, ["share", "send", "export"])) {
    score += 0.4;
    reasons.push("external_share_without_share_language_in_intent");
  }

  if (request.action === "delete_file" && !keywordHit(intent, ["delete", "remove", "purge"])) {
    score += 0.5;
    reasons.push("delete_file_without_delete_language_in_intent");
  }

  return {
    score: Math.min(1, score),
    threshold: 0.65,
    violated: score >= 0.65,
    reasons,
  };
}

export class ActionFirewall {
  constructor(private readonly integrity?: IntegrityBaselineStore) {}

  async evaluate(request: ActionRequest): Promise<ActionEvaluation> {
    const blastRadius = classifyBlastRadius(request.action);
    const provenance = summarizeProvenance(request.context?.sources, blastRadius);
    const divergence = detectIntentDivergence(request, blastRadius);
    const integrity = this.integrity
      ? await this.integrity.check(request.context?.artifact_paths)
      : undefined;

    const signals = [
      ...provenance.risk_flags,
      ...divergence.reasons,
      ...(integrity?.mutations.map((mutation) => `artifact_${mutation.status}:${mutation.path}`) ?? []),
    ];

    let verdict: FirewallVerdict = "allow";
    if ((integrity && !integrity.clean) || divergence.violated) {
      verdict = "block";
    } else if (
      provenance.directive_precedence_violation ||
      provenance.escalated_by_lower_trust ||
      isHighRiskAction(request.action) ||
      blastRadius === "high" ||
      blastRadius === "critical"
    ) {
      verdict = "require_approval";
    }

    const evaluationWithoutTelemetry = {
      verdict,
      blast_radius: blastRadius,
      signals,
      provenance,
      integrity,
      divergence,
    };

    return {
      ...evaluationWithoutTelemetry,
      telemetry: buildTelemetryVector(request, evaluationWithoutTelemetry),
    };
  }
}
