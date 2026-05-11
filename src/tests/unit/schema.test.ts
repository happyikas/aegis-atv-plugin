import { describe, expect, it } from "vitest";
import {
  mcpInterceptRequestSchema,
  memoryMetadataSchema,
  reviewerAttestationRequestSchema,
} from "../../core/schema.js";

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

  it("accepts a valid MCP intercept request", () => {
    const parsed = mcpInterceptRequestSchema.parse({
      jsonrpc: "2.0",
      id: "1",
      method: "tools/call",
      params: {
        requested_by: "aid:mcp:client",
        server_name: "github",
        tool_name: "pull_request.create",
        arguments: { title: "demo" },
        side_effect: true,
      },
    });

    expect(parsed.params.tool_name).toBe("pull_request.create");
  });

  it("accepts a reviewer attestation request", () => {
    const parsed = reviewerAttestationRequestSchema.parse({
      artifact_id: "pr-1",
      primary: {
        reviewer_id: "aid:reviewer:1",
        output: "Approve after minor doc fixes.",
        verdict: "needs_changes",
      },
      secondary: {
        reviewer_id: "aid:reviewer:2",
        output: "Approve after minor doc fixes.",
        verdict: "needs_changes",
      },
    });

    expect(parsed.artifact_id).toBe("pr-1");
  });
});
