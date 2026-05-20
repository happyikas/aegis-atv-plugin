import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { TelemetryStore } from "../../core/telemetry-store.js";
import type { ActionEvaluation, ActionRequest } from "../../core/types.js";

const tempDirs: string[] = [];

function fakeEvaluation(telemetryId: string, verdict: ActionEvaluation["verdict"]): ActionEvaluation {
  return {
    verdict,
    blast_radius: verdict === "allow" ? "low" : "high",
    signals: verdict === "allow" ? [] : ["directive_precedence_violation"],
    provenance: {
      sources: [],
      highest_trust_supporting: 100,
      highest_trust_opposing: verdict === "allow" ? 0 : 90,
      directive_precedence_violation: verdict !== "allow",
      escalated_by_lower_trust: false,
      risk_flags: verdict === "allow" ? [] : ["directive_precedence_violation"],
    },
    integrity: {
      baseline_id: "baseline-demo",
      checked_at: new Date().toISOString(),
      clean: true,
      checked_paths: [],
      mutations: [],
    },
    divergence: {
      score: 0,
      threshold: 0.65,
      violated: false,
      reasons: [],
    },
    telemetry: {
      telemetry_id: telemetryId,
      schema_version: "ATV-2080-v1-demo",
      generated_at: new Date().toISOString(),
      agent_id: "aid:executor",
      action: verdict === "allow" ? "read_file" : "external_share",
      verdict,
      blast_radius: verdict === "allow" ? "low" : "high",
      signals: verdict === "allow" ? [] : ["directive_precedence_violation"],
      vector: new Array<number>(2080).fill(0),
      vector_sha256: `${telemetryId}-sha`,
    },
  };
}

describe("TelemetryStore", () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
  });

  it("records, lists, gets, and compares telemetry events", async () => {
    const dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aegis-telemetry-"));
    tempDirs.push(dataRoot);

    const store = new TelemetryStore(dataRoot);
    const allowRequest: ActionRequest = {
      action: "read_file",
      requested_by: "aid:retriever",
      payload: { path: "MEMORY.md" },
    };
    const riskyRequest: ActionRequest = {
      action: "external_share",
      requested_by: "aid:executor",
      payload: { target: "https://example.com" },
    };

    await store.record("preview", allowRequest, fakeEvaluation("telemetry-allow", "allow"));
    await store.record("preview", riskyRequest, fakeEvaluation("telemetry-risk", "require_approval"));

    const listed = await store.list(10);
    expect(listed).toHaveLength(2);

    const fetched = await store.get("telemetry-allow");
    expect(fetched?.telemetry_id).toBe("telemetry-allow");

    const compared = await store.compare(["telemetry-allow", "telemetry-risk"]);
    expect(compared.telemetry_ids).toEqual(["telemetry-allow", "telemetry-risk"]);
    expect(compared.verdicts).toHaveLength(2);
  });
});
