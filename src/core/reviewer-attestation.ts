import { checksum, nowIso } from "./utils.js";
import { summarizeProvenance } from "./provenance.js";
import type { ReviewerAttestationRequest, ReviewerAttestationResult } from "./types.js";

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 4),
  );
}

function jaccardDistance(left: string, right: string): number {
  const leftTokens = tokenize(left);
  const rightTokens = tokenize(right);
  const union = new Set([...leftTokens, ...rightTokens]);
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token));
  if (union.size === 0) {
    return 0;
  }
  return 1 - intersection.length / union.size;
}

function provenanceOverlapScore(request: ReviewerAttestationRequest): number {
  const left = summarizeProvenance(request.primary.sources, "low").sources.map((source) => source.id);
  const right = summarizeProvenance(request.secondary.sources, "low").sources.map((source) => source.id);
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  const union = new Set([...leftSet, ...rightSet]);
  const overlap = [...leftSet].filter((id) => rightSet.has(id));
  if (union.size === 0) {
    return 0;
  }
  return overlap.length / union.size;
}

export function evaluateReviewerAttestation(
  request: ReviewerAttestationRequest,
): ReviewerAttestationResult {
  const semanticDivergence = jaccardDistance(request.primary.output, request.secondary.output);
  const provenanceOverlap = provenanceOverlapScore(request);
  const verdictMatch = request.primary.verdict === request.secondary.verdict;

  const reasons: string[] = [];
  if (!verdictMatch) {
    reasons.push("reviewer_verdict_mismatch");
  }
  if (semanticDivergence > 0.72) {
    reasons.push("review_output_divergence_above_threshold");
  }
  if (provenanceOverlap > 0.6) {
    reasons.push("reviewer_provenance_not_disjoint_enough");
  }

  return {
    artifact_id: request.artifact_id,
    attested_at: nowIso(),
    trusted: reasons.length === 0,
    primary_digest: checksum(request.primary.output),
    secondary_digest: checksum(request.secondary.output),
    provenance_overlap: provenanceOverlap,
    verdict_match: verdictMatch,
    semantic_divergence: semanticDivergence,
    reasons,
  };
}
