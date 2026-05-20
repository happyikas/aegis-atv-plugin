import fs from "node:fs/promises";
import path from "node:path";
import { canonicalize, checksum, nowIso } from "./utils.js";

export type IntentState =
  | "tentative"
  | "prepared"
  | "committed"
  | "aborted"
  | "rolled_back"
  | "compensated";

export interface IntentRecord {
  intent_id: string;
  session_id: string;
  trace_id: string;
  action: string;
  requested_by: string;
  payload_hash: string;
  policy_hash: string;
  state: IntentState;
  created_at: string;
  updated_at: string;
  history: Array<{
    state: IntentState;
    timestamp: string;
    metadata?: Record<string, unknown>;
  }>;
  metadata: Record<string, unknown>;
}

const allowedTransitions: Record<IntentState, IntentState[]> = {
  tentative: ["prepared", "aborted"],
  prepared: ["committed", "aborted", "rolled_back", "compensated"],
  committed: ["rolled_back", "compensated"],
  aborted: [],
  rolled_back: ["compensated"],
  compensated: [],
};

interface IntentLogEntry {
  intent_id: string;
  session_id: string;
  trace_id: string;
  action: string;
  requested_by: string;
  payload_hash: string;
  policy_hash: string;
  state: IntentState;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export class AtmuLedger {
  private readonly dir: string;
  private readonly logPath: string;

  constructor(private readonly dataRoot: string) {
    this.dir = path.join(this.dataRoot, "atmu");
    this.logPath = path.join(this.dir, "intent-log.jsonl");
  }

  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
  }

  private async readEntries(): Promise<IntentLogEntry[]> {
    await this.ensureDir();
    try {
      const raw = await fs.readFile(this.logPath, "utf8");
      return raw
        .split("\n")
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line) as IntentLogEntry);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  private materialize(entries: IntentLogEntry[]): IntentRecord[] {
    const records = new Map<string, IntentRecord>();
    for (const entry of entries) {
      const existing = records.get(entry.intent_id);
      if (!existing) {
        records.set(entry.intent_id, {
          intent_id: entry.intent_id,
          session_id: entry.session_id,
          trace_id: entry.trace_id,
          action: entry.action,
          requested_by: entry.requested_by,
          payload_hash: entry.payload_hash,
          policy_hash: entry.policy_hash,
          state: entry.state,
          created_at: entry.timestamp,
          updated_at: entry.timestamp,
          history: [{ state: entry.state, timestamp: entry.timestamp, metadata: entry.metadata }],
          metadata: entry.metadata ?? {},
        });
        continue;
      }
      existing.state = entry.state;
      existing.updated_at = entry.timestamp;
      existing.history.push({ state: entry.state, timestamp: entry.timestamp, metadata: entry.metadata });
      existing.metadata = {
        ...existing.metadata,
        ...(entry.metadata ?? {}),
      };
    }
    return [...records.values()].sort((left, right) => right.updated_at.localeCompare(left.updated_at));
  }

  async beginIntent(input: {
    session_id: string;
    trace_id: string;
    action: string;
    requested_by: string;
    payload_hash: string;
    policy_hash: string;
    metadata?: Record<string, unknown>;
  }): Promise<IntentRecord> {
    const existing = await this.findByTrace(input.session_id, input.trace_id);
    if (existing) {
      return existing;
    }
    const timestamp = nowIso();
    const entry: IntentLogEntry = {
      intent_id: checksum(canonicalize({
        session_id: input.session_id,
        trace_id: input.trace_id,
        action: input.action,
        created_at: timestamp,
      })).slice(0, 24),
      session_id: input.session_id,
      trace_id: input.trace_id,
      action: input.action,
      requested_by: input.requested_by,
      payload_hash: input.payload_hash,
      policy_hash: input.policy_hash,
      state: "tentative",
      timestamp,
      metadata: input.metadata,
    };
    await this.ensureDir();
    await fs.appendFile(this.logPath, `${JSON.stringify(entry)}\n`, "utf8");
    return {
      intent_id: entry.intent_id,
      session_id: entry.session_id,
      trace_id: entry.trace_id,
      action: entry.action,
      requested_by: entry.requested_by,
      payload_hash: entry.payload_hash,
      policy_hash: entry.policy_hash,
      state: entry.state,
      created_at: timestamp,
      updated_at: timestamp,
      history: [{ state: entry.state, timestamp, metadata: entry.metadata }],
      metadata: entry.metadata ?? {},
    };
  }

  async transition(intentId: string, nextState: IntentState, metadata?: Record<string, unknown>): Promise<IntentRecord> {
    const current = await this.getIntent(intentId);
    if (!current) {
      throw new Error(`Intent not found: ${intentId}`);
    }
    if (!allowedTransitions[current.state].includes(nextState)) {
      throw new Error(`Invalid intent transition: ${current.state} -> ${nextState}`);
    }
    const timestamp = nowIso();
    const entry: IntentLogEntry = {
      intent_id: current.intent_id,
      session_id: current.session_id,
      trace_id: current.trace_id,
      action: current.action,
      requested_by: current.requested_by,
      payload_hash: current.payload_hash,
      policy_hash: current.policy_hash,
      state: nextState,
      timestamp,
      metadata,
    };
    await fs.appendFile(this.logPath, `${JSON.stringify(entry)}\n`, "utf8");
    return {
      ...current,
      state: nextState,
      updated_at: timestamp,
      history: [...current.history, { state: nextState, timestamp, metadata }],
      metadata: {
        ...current.metadata,
        ...(metadata ?? {}),
      },
    };
  }

  async list(limit = 50): Promise<IntentRecord[]> {
    return this.materialize(await this.readEntries()).slice(0, limit);
  }

  async recover(): Promise<IntentRecord[]> {
    return this.materialize(await this.readEntries());
  }

  async getIntent(intentId: string): Promise<IntentRecord | null> {
    return (await this.materialize(await this.readEntries())).find((record) => record.intent_id === intentId) ?? null;
  }

  async findByTrace(sessionId: string, traceId: string): Promise<IntentRecord | null> {
    return (await this.materialize(await this.readEntries())).find(
      (record) => record.session_id === sessionId && record.trace_id === traceId,
    ) ?? null;
  }
}
