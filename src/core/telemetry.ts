import { checksum, nowIso } from "./utils.js";
import type { ActionRequest, ActionEvaluation, TelemetryVectorRecord } from "./types.js";

const VECTOR_LENGTH = 2080;
const SOFTWARE_COST_START = 1864;
const HARDWARE_COST_START = 2044;
const LINKAGE_START = 2060;
const PROVENANCE_START = 1728;

function setRange(target: number[], start: number, values: number[]): void {
  values.forEach((value, index) => {
    const position = start + index;
    if (position < target.length) {
      target[position] = value;
    }
  });
}

function normalize(value: number, max: number): number {
  return Math.max(0, Math.min(1, max === 0 ? 0 : value / max));
}

export function buildTelemetryVector(
  request: ActionRequest,
  evaluation: Omit<ActionEvaluation, "telemetry">,
): TelemetryVectorRecord {
  const vector = new Array<number>(VECTOR_LENGTH).fill(0);
  const cost = request.context?.cost ?? {};
  const sourceCount = evaluation.provenance.sources.length;
  const mutationCount = evaluation.integrity?.mutations.length ?? 0;

  setRange(vector, PROVENANCE_START, [
    normalize(sourceCount, 16),
    normalize(evaluation.provenance.highest_trust_supporting, 100),
    normalize(evaluation.provenance.highest_trust_opposing, 100),
    evaluation.provenance.directive_precedence_violation ? 1 : 0,
    evaluation.provenance.escalated_by_lower_trust ? 1 : 0,
    normalize(mutationCount, 8),
    normalize(evaluation.divergence.score, 1),
    evaluation.divergence.violated ? 1 : 0,
  ]);

  setRange(vector, SOFTWARE_COST_START, [
    normalize(cost.input_tokens ?? 0, 32000),
    normalize(cost.output_tokens ?? 0, 16000),
    normalize(cost.reasoning_tokens ?? 0, 16000),
    normalize(cost.estimated_usd ?? 0, 50),
    request.context?.human_oversight === "required" ? 1 : 0,
    evaluation.verdict === "allow" ? 1 : 0,
    evaluation.verdict === "require_approval" ? 1 : 0,
    evaluation.verdict === "block" ? 1 : 0,
  ]);

  setRange(vector, HARDWARE_COST_START, [
    normalize((cost.input_tokens ?? 0) + (cost.output_tokens ?? 0), 48000),
    normalize((cost.reasoning_tokens ?? 0) * 2, 32000),
    normalize((cost.estimated_usd ?? 0) * 1_000, 50_000),
    mutationCount > 0 ? 1 : 0,
  ]);

  setRange(vector, LINKAGE_START, [
    normalize(Math.abs((cost.input_tokens ?? 0) - (cost.output_tokens ?? 0)), 32000),
    normalize(Math.abs((cost.reasoning_tokens ?? 0) - (cost.input_tokens ?? 0)), 32000),
    normalize(evaluation.signals.length, 12),
    evaluation.blast_radius === "critical" ? 1 : 0,
    evaluation.blast_radius === "high" ? 1 : 0,
    evaluation.blast_radius === "medium" ? 1 : 0,
  ]);

  const vectorSha = checksum(JSON.stringify(vector));

  return {
    telemetry_id: checksum(
      JSON.stringify({
        generated_at: nowIso(),
        action: request.action,
        requested_by: request.requested_by,
        verdict: evaluation.verdict,
      }),
    ).slice(0, 24),
    schema_version: "ATV-2080-v1-demo",
    generated_at: nowIso(),
    agent_id: request.requested_by,
    action: request.action,
    verdict: evaluation.verdict,
    blast_radius: evaluation.blast_radius,
    signals: evaluation.signals,
    vector,
    vector_sha256: vectorSha,
  };
}
