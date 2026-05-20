import fs from "node:fs/promises";
import path from "node:path";
import { nowIso } from "./utils.js";
import type {
  ActionEvaluation,
  ActionExecutionResult,
  ActionRequest,
  TelemetryComparison,
  TelemetryEventRecord,
  TelemetrySummary,
} from "./types.js";

function summarize(record: TelemetryEventRecord): TelemetrySummary {
  return {
    telemetry_id: record.telemetry_id,
    recorded_at: record.recorded_at,
    event_type: record.event_type,
    action: record.action,
    requested_by: record.requested_by,
    verdict: record.verdict,
    blast_radius: record.blast_radius,
    signal_count: record.signals.length,
    signals: record.signals,
    vector_sha256: record.vector_sha256,
  };
}

export class TelemetryStore {
  private readonly telemetryDir: string;
  private readonly logPath: string;

  constructor(private readonly dataRoot: string) {
    this.telemetryDir = path.join(this.dataRoot, "telemetry");
    this.logPath = path.join(this.telemetryDir, "events.jsonl");
  }

  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.telemetryDir, { recursive: true });
  }

  async record(
    eventType: TelemetryEventRecord["event_type"],
    request: ActionRequest,
    evaluation?: ActionEvaluation,
    result?: Pick<ActionExecutionResult, "executed" | "queued" | "reason" | "approval_id">,
  ): Promise<TelemetryEventRecord> {
    await this.ensureDir();

    const telemetryId =
      evaluation?.telemetry.telemetry_id ??
      `event-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

    const record: TelemetryEventRecord = {
      telemetry_id: telemetryId,
      recorded_at: nowIso(),
      event_type: eventType,
      action: request.action,
      requested_by: request.requested_by,
      verdict: evaluation?.verdict,
      blast_radius: evaluation?.blast_radius,
      approval_id: result?.approval_id,
      signals: evaluation?.signals ?? [],
      declared_intent: request.context?.declared_intent,
      vector_sha256: evaluation?.telemetry.vector_sha256,
      evaluation,
      result: result
        ? {
            executed: result.executed,
            queued: result.queued,
            reason: result.reason,
          }
        : undefined,
    };

    await fs.appendFile(this.logPath, `${JSON.stringify(record)}\n`, "utf8");
    await fs.writeFile(
      path.join(this.telemetryDir, `${telemetryId}.json`),
      `${JSON.stringify(record, null, 2)}\n`,
      "utf8",
    );

    return record;
  }

  async listEvents(limit = 100): Promise<TelemetryEventRecord[]> {
    await this.ensureDir();

    try {
      const raw = await fs.readFile(this.logPath, "utf8");
      return raw
        .split("\n")
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line) as TelemetryEventRecord)
        .sort((left, right) => right.recorded_at.localeCompare(left.recorded_at))
        .slice(0, limit);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  async list(limit = 20): Promise<TelemetrySummary[]> {
    await this.ensureDir();

    try {
      const raw = await fs.readFile(this.logPath, "utf8");
      return raw
        .split("\n")
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line) as TelemetryEventRecord)
        .sort((left, right) => right.recorded_at.localeCompare(left.recorded_at))
        .slice(0, limit)
        .map(summarize);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  async get(telemetryId: string): Promise<TelemetryEventRecord | null> {
    await this.ensureDir();

    try {
      const raw = await fs.readFile(path.join(this.telemetryDir, `${telemetryId}.json`), "utf8");
      return JSON.parse(raw) as TelemetryEventRecord;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return null;
      }
      throw error;
    }
  }

  async compare(telemetryIds: string[]): Promise<TelemetryComparison> {
    const records = await Promise.all(telemetryIds.map((telemetryId) => this.get(telemetryId)));
    const found = records.filter((record): record is TelemetryEventRecord => record !== null);

    if (found.length !== telemetryIds.length) {
      const missing = telemetryIds.filter((id) => !found.some((record) => record.telemetry_id === id));
      throw new Error(`Telemetry not found: ${missing.join(", ")}`);
    }

    const signalSets = found.map((record) => new Set(record.signals));
    const sharedSignals =
      signalSets.length === 0
        ? []
        : [...signalSets[0]].filter((signal) => signalSets.every((set) => set.has(signal)));

    return {
      telemetry_ids: telemetryIds,
      compared_at: nowIso(),
      shared_signals: sharedSignals,
      verdicts: found.map((record) => ({
        telemetry_id: record.telemetry_id,
        verdict: record.verdict,
        blast_radius: record.blast_radius,
        signal_count: record.signals.length,
        vector_sha256: record.vector_sha256,
      })),
    };
  }
}
