import { describe, expect, it, vi } from "vitest";
import { CodexHooksAdapter } from "../../adapters/codex-hooks.js";
import type { AegisControlPlaneClient } from "../../core/control-plane.js";

function createControlPlaneStub(): AegisControlPlaneClient {
  return {
    startSession: vi.fn(async () => ({
      session: { session_id: "sess-1" },
      event_id: "evt-session",
    })),
    recordUserPrompt: vi.fn(async () => ({
      event_id: "evt-prompt",
      prompt_hash: "hash-prompt",
      prompt_length: 12,
    })),
    decideTool: vi.fn(async () => ({
      verdict: "require_approval" as const,
      evaluation: {
        telemetry: { telemetry_id: "tel-1" },
      },
      atv_lite: { commitment: { atv_hash: "atv-1" } },
      event_id: "evt-decision",
    })),
    recordToolResult: vi.fn(async () => ({
      atv_lite: { result: { status: "success" } },
      event_id: "evt-result",
    })),
    createApproval: vi.fn(async () => ({
      queued: true,
      item: { id: "approval-1" },
    })),
    requestApproval: vi.fn(async () => ({
      queued: true,
      item: { id: "approval-1", status: "pending" },
      event_id: "evt-approval",
    })),
    stopSession: vi.fn(async () => ({
      event_id: "evt-stop",
      summary: { status: "completed" },
    })),
  } as unknown as AegisControlPlaneClient;
}

describe("CodexHooksAdapter", () => {
  it("maps PreToolUse into a gating outcome", async () => {
    const adapter = new CodexHooksAdapter(createControlPlaneStub());

    const outcome = await adapter.handle({
      event: "PreToolUse",
      session_id: "sess-1",
      action: "read_file",
      payload: { path: "MEMORY.md" },
      agent_id: "aid:executor",
      requested_by: "aid:executor",
    });

    expect(outcome.event).toBe("PreToolUse");
    expect(outcome.continue).toBe(false);
    expect(outcome.verdict).toBe("require_approval");
    expect(outcome.telemetry_id).toBe("tel-1");
  });

  it("routes PermissionRequest into approval creation", async () => {
    const adapter = new CodexHooksAdapter(createControlPlaneStub());

    const outcome = await adapter.handle({
      event: "PermissionRequest",
      session_id: "sess-1",
      agent_id: "aid:executor",
      action: "send_email",
      payload: { to: "demo@example.com" },
    });

    expect(outcome.event).toBe("PermissionRequest");
    expect(outcome.continue).toBe(false);
    expect(outcome.approval_id).toBe("approval-1");
    expect(outcome.detail).toBe("pending");
  });
});
