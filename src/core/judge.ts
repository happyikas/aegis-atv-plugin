import type {
  ActionRequest,
  BlastRadius,
  IntegrityCheckReport,
  IntentDivergence,
  JudgeAssessment,
  ProvenanceSummary,
} from "./types.js";

export function assessWithHeuristicJudge(
  request: ActionRequest,
  blastRadius: BlastRadius,
  provenance: ProvenanceSummary,
  divergence: IntentDivergence,
  integrity?: IntegrityCheckReport,
): JudgeAssessment {
  const reasons: string[] = [];
  const advice: string[] = [];
  let score = 0.08;

  if (blastRadius === "critical") {
    score += 0.42;
    reasons.push("critical_blast_radius");
    advice.push("Require human approval before any destructive or production-adjacent action.");
  } else if (blastRadius === "high") {
    score += 0.25;
    reasons.push("high_blast_radius");
  }

  if (provenance.directive_precedence_violation) {
    score += 0.28;
    reasons.push("directive_precedence_violation");
    advice.push("Prefer higher-trust instructions over lower-trust tool or content suggestions.");
  }

  if (provenance.escalated_by_lower_trust) {
    score += 0.18;
    reasons.push("lower_trust_escalation");
  }

  if (divergence.score >= 0.65) {
    score += 0.35;
    reasons.push("severe_intent_action_divergence");
    advice.push("Align the declared intent with the requested side effect before execution.");
  } else if (divergence.score >= 0.35) {
    score += 0.16;
    reasons.push("moderate_intent_action_divergence");
  }

  if (integrity && !integrity.clean) {
    score += 0.3;
    reasons.push("artifact_integrity_drift");
    advice.push("Re-attest changed artifacts before allowing write, delete, or external-share actions.");
  }

  if (request.context?.cost?.estimated_usd && request.context.cost.estimated_usd >= 5) {
    score += 0.08;
    reasons.push("high_estimated_cost");
    advice.push("Consider review or batching for higher-cost actions.");
  }

  const capped = Math.min(1, score);
  const ambiguous = capped >= 0.42 && capped < 0.7;
  const recommendation = capped >= 0.82
    ? "block"
    : capped >= 0.42
      ? "require_approval"
      : "allow";

  if (recommendation === "allow") {
    advice.push("The current action looks acceptable under the present evidence set.");
  }

  return {
    provider: "heuristic-judge-v1",
    score: capped,
    confidence: Math.max(0.45, 1 - (ambiguous ? 0.35 : 0.15)),
    recommendation,
    ambiguous,
    reasons,
    advice,
  };
}
