import { describe, expect, it } from "vitest";
import {
  mcpInterceptRequestSchema,
  mcpTransportRequestSchema,
  memoryMetadataSchema,
  permissionRequestEventRequestSchema,
  reviewerAttestationRequestSchema,
  sessionStartRequestSchema,
  stopEventRequestSchema,
  toolDecisionRequestSchema,
  toolResultEventRequestSchema,
  userPromptEventRequestSchema,
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

  it("accepts a realistic MCP initialize request", () => {
    const parsed = mcpTransportRequestSchema.parse({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        clientInfo: {
          name: "Codex",
          version: "1.0.0",
        },
      },
    });

    expect(parsed.method).toBe("initialize");
  });

  it("accepts a realistic MCP tools/call request", () => {
    const parsed = mcpTransportRequestSchema.parse({
      jsonrpc: "2.0",
      id: "call-1",
      method: "tools/call",
      params: {
        name: "aegis.preview_action",
        arguments: {
          action: "read_file",
          requested_by: "aid:mcp:client",
          payload: { path: "MEMORY.md" },
        },
      },
    });

    expect(parsed.method).toBe("tools/call");
    if (parsed.method !== "tools/call") {
      throw new Error("Expected tools/call request");
    }
    expect(parsed.params.name).toBe("aegis.preview_action");
  });

  it("accepts MCP resources/list and prompts/list requests", () => {
    const resources = mcpTransportRequestSchema.parse({
      jsonrpc: "2.0",
      id: 3,
      method: "resources/list",
    });
    const prompts = mcpTransportRequestSchema.parse({
      jsonrpc: "2.0",
      id: 4,
      method: "prompts/list",
    });

    expect(resources.method).toBe("resources/list");
    expect(prompts.method).toBe("prompts/list");
  });

  it("accepts MCP resources/read and prompts/get requests", () => {
    const resourceRead = mcpTransportRequestSchema.parse({
      jsonrpc: "2.0",
      id: 5,
      method: "resources/read",
      params: {
        uri: "aegis://telemetry/recent",
      },
    });
    const promptGet = mcpTransportRequestSchema.parse({
      jsonrpc: "2.0",
      id: 6,
      method: "prompts/get",
      params: {
        name: "aegis_demo_walkthrough",
        arguments: { audience: "customer" },
      },
    });

    expect(resourceRead.method).toBe("resources/read");
    expect(promptGet.method).toBe("prompts/get");
  });

  it("accepts MCP resources/templates/list requests", () => {
    const templates = mcpTransportRequestSchema.parse({
      jsonrpc: "2.0",
      id: 7,
      method: "resources/templates/list",
    });

    expect(templates.method).toBe("resources/templates/list");
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

  it("accepts session start, prompt, decision, and tool result payloads", () => {
    const session = sessionStartRequestSchema.parse({
      agent_id: "aid:executor",
      workspace: "/repo",
    });
    const prompt = userPromptEventRequestSchema.parse({
      session_id: "sess-1",
      agent_id: "aid:executor",
      prompt: "Review this repo",
    });
    const decision = toolDecisionRequestSchema.parse({
      session_id: "sess-1",
      action: "read_file",
      payload: { path: "README.md" },
    });
    const result = toolResultEventRequestSchema.parse({
      session_id: "sess-1",
      trace_id: "trace-1",
      agent_id: "aid:executor",
      action: "read_file",
      status: "success",
    });

    expect(session.agent_id).toBe("aid:executor");
    expect(prompt.prompt).toBe("Review this repo");
    expect(decision.action).toBe("read_file");
    expect(result.status).toBe("success");
  });

  it("accepts permission request and stop event payloads", () => {
    const permission = permissionRequestEventRequestSchema.parse({
      session_id: "sess-1",
      agent_id: "aid:executor",
      action: "send_email",
      payload: { to: "demo@example.com" },
    });
    const stop = stopEventRequestSchema.parse({
      session_id: "sess-1",
      agent_id: "aid:executor",
      result_summary: "done",
      token_count: 10,
    });

    expect(permission.action).toBe("send_email");
    expect(stop.token_count).toBe(10);
  });
});
