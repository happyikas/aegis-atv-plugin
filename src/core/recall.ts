import type { MemoryRecord, RecallOptions } from "./types.js";

function stateAllowed(state: MemoryRecord["metadata"]["state"], mode: RecallOptions["mode"]): boolean {
  if (state === "quarantined") {
    return false;
  }

  if (state === "draft") {
    return mode === "planner" || mode === "retriever";
  }

  return true;
}

function scoreRecord(record: MemoryRecord, query?: string): number {
  let score = record.metadata.trust_score * 10;
  score += Date.parse(record.metadata.last_accessed_at) / 1e12;

  if (query && record.content.toLowerCase().includes(query.toLowerCase())) {
    score += 5;
  }

  return score;
}

function redactContent(content: string): string {
  const trimmed = content.trim();
  if (trimmed.length <= 80) {
    return "[REDACTED]";
  }

  return `${trimmed.slice(0, 80)}... [REDACTED]`;
}

export function recall(records: MemoryRecord[], options: RecallOptions = {}): MemoryRecord[] {
  const mode = options.mode ?? "default";
  const query = options.query?.trim();
  const limit = options.limit ?? 20;

  return records
    .filter((record) => stateAllowed(record.metadata.state, mode))
    .filter((record) => {
      if (!query) {
        return true;
      }

      return (
        record.content.toLowerCase().includes(query.toLowerCase()) ||
        record.metadata.source_path.toLowerCase().includes(query.toLowerCase())
      );
    })
    .sort((left, right) => scoreRecord(right, query) - scoreRecord(left, query))
    .slice(0, limit)
    .map((record) => {
      if (record.metadata.sensitivity === "high" && !options.includeSensitive) {
        return {
          ...record,
          content: redactContent(record.content),
        };
      }

      return record;
    });
}
