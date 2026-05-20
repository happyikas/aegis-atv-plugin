import fs from "node:fs/promises";
import path from "node:path";
import type { TelemetryEventRecord } from "./types.js";
import { checksum, nowIso } from "./utils.js";

export interface BurnInProfile {
  profile_id: string;
  created_at: string;
  sample_size: number;
  verdict_rates: Record<string, number>;
  action_counts: Record<string, number>;
  top_signals: Array<{ signal: string; count: number }>;
  recommended_policy: {
    divergence_block_threshold: number;
    outage_policy: "fail_open" | "require_approval" | "fail_closed";
    approval_bias: "low" | "medium" | "high";
  };
  notes: string[];
}

export class BurnInProfiler {
  private readonly dir: string;
  private readonly latestPath: string;

  constructor(private readonly dataRoot: string) {
    this.dir = path.join(this.dataRoot, "burnin");
    this.latestPath = path.join(this.dir, "latest-profile.json");
  }

  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
  }

  async calibrate(records: TelemetryEventRecord[]): Promise<BurnInProfile> {
    await this.ensureDir();
    const verdictCounts: Record<string, number> = {};
    const actionCounts: Record<string, number> = {};
    const signalCounts: Record<string, number> = {};

    for (const record of records) {
      const verdict = record.verdict ?? "unknown";
      verdictCounts[verdict] = (verdictCounts[verdict] ?? 0) + 1;
      actionCounts[record.action] = (actionCounts[record.action] ?? 0) + 1;
      for (const signal of record.signals) {
        signalCounts[signal] = (signalCounts[signal] ?? 0) + 1;
      }
    }

    const sampleSize = records.length;
    const verdictRates = Object.fromEntries(
      Object.entries(verdictCounts).map(([key, count]) => [key, sampleSize === 0 ? 0 : count / sampleSize]),
    );
    const topSignals = Object.entries(signalCounts)
      .sort((left, right) => right[1] - left[1])
      .slice(0, 5)
      .map(([signal, count]) => ({ signal, count }));

    const blockRate = verdictRates.block ?? 0;
    const approvalRate = verdictRates.require_approval ?? 0;

    const notes: string[] = [];
    if (sampleSize < 10) {
      notes.push("Calibration sample is small; keep the profile in observe-first mode.");
    }
    if (approvalRate > 0.35) {
      notes.push("Approval rate is high; reduce false positives before broad rollout.");
    }
    if (blockRate > 0.2) {
      notes.push("Block rate is elevated; review drift, divergence, and secret-access rules before widening deployment.");
    }

    const profile: BurnInProfile = {
      profile_id: checksum(JSON.stringify({ sampleSize, verdictCounts, actionCounts, generated_at: nowIso() })).slice(0, 16),
      created_at: nowIso(),
      sample_size: sampleSize,
      verdict_rates: verdictRates,
      action_counts: actionCounts,
      top_signals: topSignals,
      recommended_policy: {
        divergence_block_threshold: approvalRate > 0.35 ? 0.75 : 0.65,
        outage_policy: blockRate > 0.15 ? "require_approval" : "fail_open",
        approval_bias: approvalRate > 0.35 ? "high" : approvalRate > 0.15 ? "medium" : "low",
      },
      notes,
    };

    await fs.writeFile(this.latestPath, `${JSON.stringify(profile, null, 2)}\n`, "utf8");
    return profile;
  }

  async latest(): Promise<BurnInProfile | null> {
    try {
      const raw = await fs.readFile(this.latestPath, "utf8");
      return JSON.parse(raw) as BurnInProfile;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }
}
