import { checksum } from "./utils.js";
import type {
  BlastRadius,
  InstructionSourceEvidence,
  InstructionSourceInput,
  InstructionSourceKind,
  ProvenanceSummary,
} from "./types.js";

const DEFAULT_TRUST: Record<InstructionSourceKind, number> = {
  user_prompt: 100,
  system_prompt: 95,
  developer_prompt: 90,
  plugin_manifest: 80,
  skill_definition: 78,
  repo_file: 72,
  memory: 65,
  tool_output: 40,
  web_content: 25,
};

function clampTrustLevel(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeSource(source: InstructionSourceInput): InstructionSourceEvidence {
  const contentHash = checksum(
    [source.kind, source.label, source.locator ?? "", source.content ?? ""].join("::"),
  );

  return {
    id: checksum(`${source.kind}:${source.label}:${source.locator ?? ""}`).slice(0, 16),
    kind: source.kind,
    label: source.label,
    locator: source.locator,
    content_hash: contentHash,
    trust_level: clampTrustLevel(source.trust_level ?? DEFAULT_TRUST[source.kind]),
    stance: source.stance ?? "neutral",
  };
}

function lowerTrustEscalationPresent(
  sources: InstructionSourceEvidence[],
  highestTrustSupporting: number,
  blastRadius: BlastRadius,
): boolean {
  if (blastRadius === "low") {
    return false;
  }

  return sources.some(
    (source) =>
      source.stance === "supporting" &&
      source.trust_level < highestTrustSupporting &&
      (source.kind === "web_content" || source.kind === "tool_output" || source.kind === "repo_file"),
  );
}

export function summarizeProvenance(
  inputs: InstructionSourceInput[] | undefined,
  blastRadius: BlastRadius,
): ProvenanceSummary {
  const sources = (inputs ?? []).map(normalizeSource);
  const supporting = sources.filter((source) => source.stance === "supporting");
  const opposing = sources.filter((source) => source.stance === "opposing");
  const highestTrustSupporting = Math.max(0, ...supporting.map((source) => source.trust_level));
  const highestTrustOpposing = Math.max(0, ...opposing.map((source) => source.trust_level));
  const directivePrecedenceViolation =
    highestTrustOpposing > 0 && highestTrustSupporting > 0 && highestTrustSupporting < highestTrustOpposing;
  const escalatedByLowerTrust = lowerTrustEscalationPresent(
    sources,
    highestTrustSupporting,
    blastRadius,
  );

  const riskFlags: string[] = [];
  if (directivePrecedenceViolation) {
    riskFlags.push("directive_precedence_violation");
  }
  if (escalatedByLowerTrust) {
    riskFlags.push("lower_trust_escalation");
  }
  if (sources.some((source) => source.kind === "web_content" && source.stance === "supporting")) {
    riskFlags.push("web_instruction_present");
  }
  if (sources.some((source) => source.kind === "tool_output" && source.stance === "supporting")) {
    riskFlags.push("tool_output_instruction_present");
  }

  return {
    sources,
    highest_trust_supporting: highestTrustSupporting,
    highest_trust_opposing: highestTrustOpposing,
    directive_precedence_violation: directivePrecedenceViolation,
    escalated_by_lower_trust: escalatedByLowerTrust,
    risk_flags: riskFlags,
  };
}
