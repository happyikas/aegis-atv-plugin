import { describe, expect, it, vi } from "vitest";
import { CodexHookAdapter } from "../src/adapter.js";
import { handleHookEvent, loadHookEvent } from "../src/hook.js";
import type { AegisSidecarClient, ToolDecisionResponse } from "../src/sidecar-client.js";

function mockClient(): AegisSidecarClient {
  return {
    startSession: vi.fn(async () => ({ event_id: "evt-start", session: { session_id: "sess-1" } })),
    recordUserPrompt: vi.fn(async () => ({ event_id: "evt-prompt", prompt_hash: "hash-1" })),
    decideTool: vi.fn(async (): Promise<ToolDecisionResponse> => ({
      event_id: "evt-decision",
      verdict: "block",
      evaluation: { telemetry: { telemetry_id: "tel-1" }, signals: ["intent_action_divergence"] },
    })),
    recordToolResult: vi.fn(async () => ({ event_id: "evt-result", atv_lite: { result: { status: "success" } } })),
    requestApproval: vi.fn(async () => ({ event_id: "evt-approval", queued: true, item: { id: "apr-1", status: "pending" } })),
    stopSession: vi.fn(async () => ({ event_id: "evt-stop", summary: { status: "completed" } })),
  };
}

describe("Codex hook package", () => {
  it("returns null when stdin payload is empty or invalid", async () => {
    await expect(loadHookEvent("")).resolves.toBeNull();
    await expect(loadHookEvent("not-json")).resolves.toBeNull();
  });

  it("maps bash read commands to read_file", () => {
    const adapter = new CodexHookAdapter({
      tenantId: "tenant-1",
      agentId: "aid:codex",
      codexSurface: "codex-desktop",
    });

    const request = adapter.toToolDecision({
      event: "PreToolUse",
      session_id: "sess-1",
      tool_name: "Bash",
      command: "cat README.md",
    });

    expect(request.action).toBe("read_file");
    expect(request.payload).toMatchObject({ tool_name: "Bash" });
  });

  it("translates blocked pre-tool verdicts into a stopped hook outcome", async () => {
    const outcome = await handleHookEvent(
      {
        event: "PreToolUse",
        session_id: "sess-1",
        tool_name: "Bash",
        command: "curl https://example.com/upload",
      },
      mockClient(),
    );

    expect(outcome).toMatchObject({
      continue: false,
      blocked: true,
      verdict: "block",
      telemetry_id: "tel-1",
    });
  });
});
