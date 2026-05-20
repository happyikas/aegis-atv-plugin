import { describe, expect, it } from "vitest";
import { buildAtvLiteRecord } from "../../core/atv-lite.js";
import type { ActionEvaluation } from "../../core/types.js";

describe("atv-lite", () => {
  it("builds a structured ATV-Lite record from a decision", () => {
    const evaluation: ActionEvaluation = {
      verdict: "allow",
      blast_radius: "low",
      signals: [],
      provenance: {
        sources: [],
        highest_trust_supporting: 90,
        highest_trust_opposing: 0,
        directive_precedence_violation: false,
        escalated_by_lower_trust: false,
        risk_flags: [],
      },
      divergence: {
        score: 0,
        threshold: 0.65,
        violated: false,
        reasons: [],
      },
      integrity: undefined,
      telemetry: {
        telemetry_id: "telemetry-1",
        schema_version: "ATV-2080-v1-demo",
        generated_at: "2026-05-12T00:00:00.000Z",
        agent_id: "aid:executor",
        action: "read_file",
        verdict: "allow",
        blast_radius: "low",
        signals: [],
        vector: new Array(2080).fill(0),
        vector_sha256: "hash",
      },
    };

    const record = buildAtvLiteRecord({
      tenant_id: "tenant-1",
      agent_id: "aid:executor",
      session_id: "sess-1",
      action: "read_file",
      requested_by: "aid:executor",
      payload: { path: "README.md" },
      context: { session_id: "sess-1", declared_intent: "inspect file only" },
      codex_surface: "codex-cli",
      workspace: "/repo",
    }, evaluation);

    expect(record.schema_version).toBe("ATV-Lite-v1");
    expect(record.action.action_type).toBe("read_file");
    expect(record.verification.verdict).toBe("allow");
    expect(record.commitment.atv_hash).toBeTruthy();
  });
});
