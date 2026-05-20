import { describe, expect, it } from "vitest";
import { evaluateReviewerAttestation } from "../../core/reviewer-attestation.js";

describe("evaluateReviewerAttestation", () => {
  it("trusts matching reviewer outputs with disjoint provenance", () => {
    const result = evaluateReviewerAttestation({
      artifact_id: "artifact-1",
      primary: {
        reviewer_id: "aid:reviewer:1",
        output: "Approve. Findings addressed and tests pass.",
        verdict: "approve",
        sources: [{ kind: "repo_file", label: "diff-a", content: "A", stance: "supporting" }],
      },
      secondary: {
        reviewer_id: "aid:reviewer:2",
        output: "Approve. Findings addressed and tests pass.",
        verdict: "approve",
        sources: [{ kind: "tool_output", label: "ci-run", content: "B", stance: "supporting" }],
      },
    });

    expect(result.trusted).toBe(true);
    expect(result.reasons).toHaveLength(0);
  });

  it("marks reviewer outputs unattested when verdicts diverge", () => {
    const result = evaluateReviewerAttestation({
      artifact_id: "artifact-2",
      primary: {
        reviewer_id: "aid:reviewer:1",
        output: "Approve.",
        verdict: "approve",
      },
      secondary: {
        reviewer_id: "aid:reviewer:2",
        output: "Reject because security issue remains.",
        verdict: "reject",
      },
    });

    expect(result.trusted).toBe(false);
    expect(result.reasons).toContain("reviewer_verdict_mismatch");
  });
});
