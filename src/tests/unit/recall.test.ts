import { describe, expect, it } from "vitest";
import { recall } from "../../core/recall.js";
import type { MemoryRecord } from "../../core/types.js";

function record(
  sourcePath: string,
  state: MemoryRecord["metadata"]["state"],
  trustScore: number,
  content: string,
  sensitivity: MemoryRecord["metadata"]["sensitivity"] = "medium",
  lastAccessedAt = "2026-04-09T01:00:00.000Z",
): MemoryRecord {
  return {
    metadata: {
      memory_id: sourcePath,
      source_path: sourcePath,
      aid: "aid:planner",
      created_at: "2026-04-09T00:00:00.000Z",
      last_accessed_at: lastAccessedAt,
      state,
      trust_score: trustScore,
      sensitivity,
      retention_class: "standard",
      lineage: [],
      checkpoint_refs: [],
    },
    content,
  };
}

describe("recall", () => {
  it("excludes quarantined records and draft records in default mode", () => {
    const results = recall([
      record("memory/1.md", "draft", 0.9, "draft note"),
      record("memory/2.md", "verified", 0.8, "verified note"),
      record("memory/3.md", "quarantined", 0.99, "quarantined note"),
    ]);

    expect(results).toHaveLength(1);
    expect(results[0]?.metadata.source_path).toBe("memory/2.md");
  });

  it("redacts high sensitivity by default", () => {
    const [result] = recall([
      record("memory/secret.md", "committed", 0.8, "secret material that should not be fully visible", "high"),
    ]);

    expect(result?.content).toContain("[REDACTED]");
  });

  it("allows draft records in planner and retriever mode only", () => {
    const records = [record("memory/draft.md", "draft", 0.4, "draft note")];

    expect(recall(records, { mode: "planner" })).toHaveLength(1);
    expect(recall(records, { mode: "retriever" })).toHaveLength(1);
    expect(recall(records, { mode: "verifier" })).toHaveLength(0);
    expect(recall(records, { mode: "default" })).toHaveLength(0);
  });

  it("ranks by trust score and recency", () => {
    const results = recall([
      record("memory/older-high-trust.md", "verified", 0.9, "older", "medium", "2026-04-09T00:00:00.000Z"),
      record("memory/newer-low-trust.md", "verified", 0.2, "newer", "medium", "2026-04-09T03:00:00.000Z"),
      record("memory/newer-high-trust.md", "committed", 0.95, "best", "medium", "2026-04-09T02:00:00.000Z"),
    ]);

    expect(results.map((item) => item.metadata.source_path)).toEqual([
      "memory/newer-high-trust.md",
      "memory/older-high-trust.md",
      "memory/newer-low-trust.md",
    ]);
  });

  it("matches query against content and source path", () => {
    const results = recall(
      [
        record("memory/alpha.md", "verified", 0.5, "contains the match keyword"),
        record("memory/beta-match.md", "verified", 0.5, "other content"),
        record("memory/gamma.md", "verified", 0.5, "unrelated"),
      ],
      { query: "match" },
    );

    expect(results.map((item) => item.metadata.source_path)).toEqual([
      "memory/alpha.md",
      "memory/beta-match.md",
    ]);
  });

  it("returns full content for high sensitivity records when includeSensitive is true", () => {
    const [result] = recall(
      [
        record(
          "memory/secret.md",
          "committed",
          0.8,
          "secret material that should remain visible for authorized recall",
          "high",
        ),
      ],
      { includeSensitive: true },
    );

    expect(result?.content).toContain("authorized recall");
    expect(result?.content).not.toContain("[REDACTED]");
  });
});
