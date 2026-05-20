import { describe, expect, it } from "vitest";
import { canTransition, transitionMetadata } from "../../core/atmu.js";
import type { MemoryMetadata } from "../../core/types.js";

function sampleMetadata(state: MemoryMetadata["state"]): MemoryMetadata {
  return {
    memory_id: "m1",
    source_path: "memory/test.md",
    aid: "aid:planner",
    created_at: "2026-04-09T00:00:00.000Z",
    last_accessed_at: "2026-04-09T00:00:00.000Z",
    state,
    trust_score: 0.5,
    sensitivity: "medium",
    retention_class: "standard",
    lineage: [],
    checkpoint_refs: [],
  };
}

describe("ATMU-lite transitions", () => {
  it("allows draft to verified", () => {
    const updated = transitionMetadata(sampleMetadata("draft"), "verified");
    expect(updated.state).toBe("verified");
    expect(updated.verified_at).toBeDefined();
  });

  it("allows verified to committed", () => {
    const updated = transitionMetadata(sampleMetadata("verified"), "committed");
    expect(updated.state).toBe("committed");
  });

  it("allows draft and verified to quarantined", () => {
    expect(transitionMetadata(sampleMetadata("draft"), "quarantined").state).toBe("quarantined");
    expect(transitionMetadata(sampleMetadata("verified"), "quarantined").state).toBe("quarantined");
  });

  it("rejects draft to committed", () => {
    expect(() => transitionMetadata(sampleMetadata("draft"), "committed")).toThrow(
      "Invalid state transition",
    );
  });

  it("rejects committed to quarantined without force", () => {
    expect(canTransition("committed", "quarantined")).toBe(false);
    expect(() => transitionMetadata(sampleMetadata("committed"), "quarantined")).toThrow(
      "Invalid state transition",
    );
  });

  it("allows committed to quarantined with force", () => {
    const updated = transitionMetadata(sampleMetadata("committed"), "quarantined", true);
    expect(updated.state).toBe("quarantined");
  });

  it("does not allow transitions from quarantined", () => {
    expect(canTransition("quarantined", "verified")).toBe(false);
    expect(() => transitionMetadata(sampleMetadata("quarantined"), "verified")).toThrow(
      "Invalid state transition",
    );
  });
});
