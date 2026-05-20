import { CodexHookAdapter, type CodexHookPayload } from "./adapter.js";
import type { AegisSidecarClient } from "./sidecar-client.js";
import { HttpAegisSidecarClient } from "./sidecar-client.js";
import { translateVerdict, type HookCommandOutcome } from "./verdict.js";

type HookOutagePolicy = "fail_open" | "fail_closed" | "require_approval";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8").trim();
}

export async function loadHookEvent(raw?: string): Promise<CodexHookPayload | null> {
  const value = raw ?? (await readStdin());
  if (!value) {
    return null;
  }
  try {
    return JSON.parse(value) as CodexHookPayload;
  } catch {
    return null;
  }
}

export async function handleHookEvent(
  event: CodexHookPayload,
  client: AegisSidecarClient,
  adapter = new CodexHookAdapter({
    tenantId: process.env.AEGIS_TENANT_ID ?? "local-tenant",
    agentId: process.env.AEGIS_AGENT_ID ?? "aid:codex",
    codexSurface: process.env.AEGIS_CODEX_SURFACE ?? "codex-desktop",
  }),
): Promise<HookCommandOutcome> {
  switch (event.event) {
    case "SessionStart": {
      const response = await client.startSession(adapter.toSessionStart(event));
      return {
        continue: true,
        event: event.event,
        event_id: response.event_id,
        detail: response.session.session_id,
      };
    }
    case "UserPromptSubmit": {
      const response = await client.recordUserPrompt(adapter.toUserPrompt(event));
      return {
        continue: true,
        event: event.event,
        event_id: response.event_id,
        detail: response.prompt_hash,
      };
    }
    case "PreToolUse": {
      const response = await client.decideTool(adapter.toToolDecision(event));
      return translateVerdict({
        event: event.event,
        verdict: response.verdict,
        event_id: response.event_id,
        telemetry_id: response.evaluation?.telemetry?.telemetry_id,
        approval_id: response.item?.id,
        detail: response.evaluation?.signals?.join(", ") || response.verdict,
      });
    }
    case "PermissionRequest": {
      const response = await client.requestApproval(adapter.toPermissionRequest(event));
      return {
        continue: false,
        event: event.event,
        event_id: response.event_id,
        approval_id: response.item?.id,
        approval_required: true,
        detail: response.item?.status ?? "pending",
      };
    }
    case "PostToolUse": {
      const response = await client.recordToolResult(adapter.toToolResult(event));
      return {
        continue: true,
        event: event.event,
        event_id: response.event_id,
        detail: response.atv_lite?.result?.status,
      };
    }
    case "Stop": {
      const response = await client.stopSession(adapter.toStop(event));
      return {
        continue: true,
        event: event.event,
        event_id: response.event_id,
        detail: response.summary?.status,
      };
    }
    default:
      return {
        continue: true,
        event: event.event,
        detail: "unsupported_event_passed_through",
      };
  }
}

function resolveOutagePolicy(): HookOutagePolicy {
  const value = process.env.AEGIS_HOOK_OUTAGE_POLICY?.trim().toLowerCase();
  if (value === "fail_closed" || value === "require_approval" || value === "fail_open") {
    return value;
  }
  return process.env.AEGIS_HOOK_FAIL_OPEN === "0" ? "fail_closed" : "fail_open";
}

function renderOutageOutcome(event: CodexHookPayload, policy: HookOutagePolicy, message: string): HookCommandOutcome {
  if (policy === "require_approval") {
    return {
      continue: false,
      event: event.event,
      approval_required: true,
      reason: "aegis_sidecar_unavailable",
      detail: message,
      suppressed_hook_error: true,
    };
  }
  if (policy === "fail_closed") {
    return {
      continue: false,
      event: event.event,
      blocked: true,
      reason: "aegis_sidecar_unavailable",
      detail: message,
      suppressed_hook_error: true,
    };
  }
  return {
    continue: true,
    event: event.event,
    detail: message,
    suppressed_hook_error: true,
  };
}

export async function main(): Promise<void> {
  const event = await loadHookEvent();
  if (!event) {
    return;
  }

  const outagePolicy = resolveOutagePolicy();
  const client = new HttpAegisSidecarClient();

  try {
    const outcome = await handleHookEvent(event, client);
    process.stdout.write(`${JSON.stringify(outcome)}\n`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stdout.write(`${JSON.stringify(renderOutageOutcome(event, outagePolicy, message))}\n`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}
