import { describe, expect, it } from "vitest";
import { memoryMetadataSchema } from "../../core/schema.js";

describe("memory metadata schema", () => {
  it("accepts a valid sidecar metadata object", () => {
    const parsed = memoryMetadataSchema.parse({
      memory_id: "abc123",
      source_path: "memory/test.md",
      aid: "aid:planner",
      created_at: "2026-04-09T00:00:00.000Z",
      last_accessed_at: "2026-04-09T00:00:00.000Z",
      state: "draft",
      trust_score: 0.5,
      sensitivity: "medium",
      retention_class: "standard",
      lineage: [],
      checkpoint_refs: [],
    });

    expect(parsed.state).toBe("draft");
  });

  it("rejects invalid trust scores", () => {
    expect(() =>
      memoryMetadataSchema.parse({
        memory_id: "abc123",
        source_path: "memory/test.md",
        aid: "aid:planner",
        created_at: "2026-04-09T00:00:00.000Z",
        last_accessed_at: "2026-04-09T00:00:00.000Z",
        state: "draft",
        trust_score: 2,
        sensitivity: "medium",
        retention_class: "standard",
        lineage: [],
        checkpoint_refs: [],
      }),
    ).toThrow();
  });
});
