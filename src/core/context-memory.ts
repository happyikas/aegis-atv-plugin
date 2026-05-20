import fs from "node:fs/promises";
import path from "node:path";
import { checksum, nowIso } from "./utils.js";

export type ContextMemoryKind =
  | "session"
  | "prompt"
  | "decision"
  | "result"
  | "approval"
  | "stop"
  | "analysis";

export interface ContextMemoryEntry {
  entry_id: string;
  recorded_at: string;
  session_id?: string;
  trace_id?: string;
  kind: ContextMemoryKind;
  title: string;
  content: string;
  content_hash: string;
  tags: string[];
  metadata: Record<string, unknown>;
}

export interface ContextMemoryQuery {
  session_id?: string;
  trace_id?: string;
  kind?: ContextMemoryKind;
  text?: string;
  limit?: number;
}

export interface ContextMemoryProfile {
  generated_at: string;
  total_entries: number;
  by_kind: Record<string, number>;
  by_session: Record<string, number>;
  latest_entries: Array<{
    entry_id: string;
    kind: ContextMemoryKind;
    recorded_at: string;
    session_id?: string;
    trace_id?: string;
    title: string;
  }>;
}

export class ContextMemoryStore {
  private readonly dir: string;
  private readonly logPath: string;

  constructor(private readonly dataRoot: string) {
    this.dir = path.join(this.dataRoot, "context-memory");
    this.logPath = path.join(this.dir, "entries.jsonl");
  }

  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
  }

  async append(input: {
    session_id?: string;
    trace_id?: string;
    kind: ContextMemoryKind;
    title: string;
    content: string;
    tags?: string[];
    metadata?: Record<string, unknown>;
  }): Promise<ContextMemoryEntry> {
    await this.ensureDir();
    const recordedAt = nowIso();
    const entry: ContextMemoryEntry = {
      entry_id: checksum(JSON.stringify({
        recorded_at: recordedAt,
        session_id: input.session_id,
        trace_id: input.trace_id,
        kind: input.kind,
        title: input.title,
      })).slice(0, 24),
      recorded_at: recordedAt,
      session_id: input.session_id,
      trace_id: input.trace_id,
      kind: input.kind,
      title: input.title,
      content: input.content,
      content_hash: checksum(input.content),
      tags: input.tags ?? [],
      metadata: input.metadata ?? {},
    };
    await fs.appendFile(this.logPath, `${JSON.stringify(entry)}\n`, "utf8");
    return entry;
  }

  async listAll(): Promise<ContextMemoryEntry[]> {
    await this.ensureDir();
    try {
      const raw = await fs.readFile(this.logPath, "utf8");
      return raw
        .split("\n")
        .filter((line) => line.trim().length > 0)
        .map((line) => JSON.parse(line) as ContextMemoryEntry)
        .sort((left, right) => right.recorded_at.localeCompare(left.recorded_at));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw error;
    }
  }

  async query(query: ContextMemoryQuery = {}): Promise<ContextMemoryEntry[]> {
    const text = query.text?.trim().toLowerCase();
    const limit = query.limit ?? 20;
    return (await this.listAll())
      .filter((entry) => !query.session_id || entry.session_id === query.session_id)
      .filter((entry) => !query.trace_id || entry.trace_id === query.trace_id)
      .filter((entry) => !query.kind || entry.kind === query.kind)
      .filter((entry) => {
        if (!text) return true;
        return entry.title.toLowerCase().includes(text) || entry.content.toLowerCase().includes(text);
      })
      .slice(0, limit);
  }

  async profile(sessionId?: string): Promise<ContextMemoryProfile> {
    const entries = (await this.listAll()).filter((entry) => !sessionId || entry.session_id === sessionId);
    const byKind: Record<string, number> = {};
    const bySession: Record<string, number> = {};
    for (const entry of entries) {
      byKind[entry.kind] = (byKind[entry.kind] ?? 0) + 1;
      if (entry.session_id) {
        bySession[entry.session_id] = (bySession[entry.session_id] ?? 0) + 1;
      }
    }
    return {
      generated_at: nowIso(),
      total_entries: entries.length,
      by_kind: byKind,
      by_session: bySession,
      latest_entries: entries.slice(0, 10).map((entry) => ({
        entry_id: entry.entry_id,
        kind: entry.kind,
        recorded_at: entry.recorded_at,
        session_id: entry.session_id,
        trace_id: entry.trace_id,
        title: entry.title,
      })),
    };
  }
}
