import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BurnInProfiler } from "../../core/burnin.js";
import type { TelemetryEventRecord } from "../../core/types.js";

const tempDirs: string[] = [];

describe("BurnInProfiler", () => {
  afterEach(async () => {
    await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
  });

  it("derives a calibration profile from telemetry samples", async () => {
    const dataRoot = await fs.mkdtemp(path.join(os.tmpdir(), "aegis-burnin-"));
    tempDirs.push(dataRoot);

    const profiler = new BurnInProfiler(dataRoot);
    const records: TelemetryEventRecord[] = [
      {
        telemetry_id: "t-1",
        recorded_at: new Date().toISOString(),
        event_type: "preview",
        action: "read_file",
        requested_by: "aid:executor",
        verdict: "allow",
        blast_radius: "low",
        signals: [],
      },
      {
        telemetry_id: "t-2",
        recorded_at: new Date().toISOString(),
        event_type: "preview",
        action: "external_share",
        requested_by: "aid:executor",
        verdict: "require_approval",
        blast_radius: "high",
        signals: ["directive_precedence_violation"],
      },
    ];

    const profile = await profiler.calibrate(records);
    expect(profile.sample_size).toBe(2);
    expect(profile.recommended_policy.outage_policy).toBeTruthy();
    expect((await profiler.latest())?.profile_id).toBe(profile.profile_id);
  });
});
